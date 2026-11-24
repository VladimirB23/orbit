"""Keeps the sessions table in step with the journals while the server runs."""

import asyncio
import logging
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionImport
from orbit.journal import journal_files, read_journals

INTERVAL_SECONDS = 15.0

log = logging.getLogger(__name__)

Signature = tuple[frozenset[tuple[Path, int, int]], frozenset[str]]


class JournalSync:
    """Reads the vault, writes only to the database, and only when something has changed."""

    def __init__(self, engine: Engine, vault: Path, interval: float = INTERVAL_SECONDS) -> None:
        self._engine = engine
        self._vault = vault
        self._interval = interval
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

    async def run(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            try:
                await asyncio.to_thread(self.sync)
            except Exception:  # a locked or half-written file: the next round will see it
                log.warning("session journals were not read, will try again", exc_info=True)
            try:
                async with asyncio.timeout(self._interval):
                    await stop.wait()
            except TimeoutError:
                pass
