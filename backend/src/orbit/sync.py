"""Keeps sessions and commits in step with the journals and git while the server runs."""

import asyncio
import logging
from abc import ABC, abstractmethod
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from orbit.domain.commits import CommitRecord
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionImport
from orbit.gitlog import fingerprint, local_folder, read_commits
from orbit.journal import journal_files, read_journals

INTERVAL_SECONDS = 15.0

log = logging.getLogger(__name__)

Signature = tuple[frozenset[tuple[Path, int, int]], frozenset[str]]


class Sync(ABC):
    """Looks at the outside world now and then, writes only to the database."""

    what = ""

    def __init__(self, engine: Engine, interval: float = INTERVAL_SECONDS) -> None:
        self._engine = engine
        self._interval = interval

    @abstractmethod
    def sync(self) -> object:
        """One round; cheap when nothing has changed."""

    async def run(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            try:
                await asyncio.to_thread(self.sync)
            except Exception:  # a locked or half-written file: the next round will see it
                log.warning("%s were not read, will try again", self.what, exc_info=True)
            try:
                async with asyncio.timeout(self._interval):
                    await stop.wait()
            except TimeoutError:
                pass


class JournalSync(Sync):
    """Reads the vault, and only when something has changed there."""

    what = "session journals"

    def __init__(self, engine: Engine, vault: Path, interval: float = INTERVAL_SECONDS) -> None:
        super().__init__(engine, interval)
        self._vault = vault
        self._seen: Signature | None = None

    def _look(self, orbit: Orbit) -> Signature:
        """What the result depends on: the files, and which projects there are to match."""
        stats = [(path, path.stat()) for path in journal_files(self._vault)]
        return (
            frozenset((path, stat.st_mtime_ns, stat.st_size) for path, stat in stats),
            frozenset(p.slug for p in orbit.list_projects(include_archived=True)),
        )

    def sync(self) -> SessionImport | None:
        """None when nothing has changed since the last successful run."""
        with Session(self._engine) as session:
            orbit = Orbit(session, actor=Actor.SYSTEM)
            current = self._look(orbit)
            if current == self._seen:
                return None
            result = orbit.import_sessions(read_journals(self._vault).records)
            session.commit()
        self._seen = current
        return result


class RepoSync(Sync):
    """Reads git of the project folders; a folder that is away keeps what is known of it."""

    what = "commits"

    def __init__(self, engine: Engine, interval: float = INTERVAL_SECONDS) -> None:
        super().__init__(engine, interval)
        self._seen: dict[str, object] = {}

    def sync(self) -> dict[str, int]:
        """Projects that were read again, with the number of their commits."""
        done: dict[str, int] = {}
        with Session(self._engine) as session:
            orbit = Orbit(session, actor=Actor.SYSTEM)
            for project in orbit.list_projects(include_archived=True):
                slug, folder = project.slug, local_folder(project.repo_path)
                if folder is None:
                    continue
                current = (project.id, folder, fingerprint(folder))
                if self._seen.get(slug) == current:
                    continue
                try:
                    commits = read_commits(folder)
                except Exception:  # asked again when something changes there
                    log.warning("commits of %s were not read", slug, exc_info=True)
                    commits = None
                if commits is not None:
                    orbit.import_commits(slug, [CommitRecord(sha, at) for sha, at in commits])
                    session.commit()
                    done[slug] = len(commits)
                self._seen[slug] = current
        return done
