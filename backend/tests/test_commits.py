"""Commits are read from git itself: the session journals miss a part of them."""

import json
import os
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session
from typer.testing import CliRunner

from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.db.engine import make_engine
from orbit.db.models import Commit
from orbit.domain.commits import CommitRecord
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from orbit.domain.undo import undo
from orbit.gitlog import local_folder, read_commits
from orbit.sync import RepoSync

T1 = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)
T2 = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)


def git(repo: Path, *args: str, at: str = "2026-11-20T12:00:00+03:00") -> str:
    env = os.environ | {
        "GIT_AUTHOR_DATE": at,
        "GIT_COMMITTER_DATE": "2026-11-25T00:00:00+00:00",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
    }
    command = ["git", "-c", "user.name=T", "-c", "user.email=t@example.com", "-C", str(repo)]
    done = subprocess.run([*command, *args], env=env, check=True, capture_output=True, text=True)
    return done.stdout.strip()


def commit(repo: Path, text: str, at: str = "2026-11-20T12:00:00+03:00") -> str:
    git(repo, "commit", "--allow-empty", "-m", text, at=at)
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    folder = tmp_path / "repo"
    folder.mkdir()
    git(folder, "init", "-b", "main")
    return folder


# --- reading git ----------------------------------------------------------------


def test_commits_come_with_the_moment_they_were_written(repo: Path) -> None:
    sha = commit(repo, "one")
    assert read_commits(repo) == [(sha, datetime(2026, 11, 20, 9, 0, tzinfo=UTC))]


def test_work_on_unmerged_branches_counts_merges_do_not(repo: Path) -> None:
    commit(repo, "one")
    git(repo, "checkout", "-b", "stage")
    commit(repo, "two")
    git(repo, "checkout", "main")
    git(repo, "merge", "--no-ff", "stage", "-m", "merge")
    git(repo, "checkout", "-b", "other")
    commit(repo, "three")
    commits = read_commits(repo)
    assert commits is not None
    assert len(commits) == 3


def test_a_stash_is_not_a_commit_of_the_project(repo: Path) -> None:
    commit(repo, "one")
    (repo / "file.txt").write_text("x", encoding="utf-8")
    git(repo, "add", "file.txt")
    git(repo, "stash")
    assert len(read_commits(repo) or []) == 1


def test_a_repository_without_commits_is_empty_not_broken(repo: Path) -> None:
    assert read_commits(repo) == []


def test_not_a_repository(tmp_path: Path) -> None:
    assert read_commits(tmp_path) is None
    assert read_commits(tmp_path / "missing") is None


def test_a_folder_inside_another_repository_is_not_its_own(repo: Path) -> None:
    commit(repo, "one")
    (repo / "inner").mkdir()
    assert read_commits(repo / "inner") is None


@pytest.mark.parametrize(
    "path", [None, "", "projects/orbit", "\\\\server\\share\\repo", "//server/share", "ssh://x/y"]
)
def test_only_local_absolute_folders(path: str | None) -> None:
    """Opening a network path could send the Windows password hash to somebody else's server."""
    assert local_folder(path) is None


def test_a_local_folder(tmp_path: Path) -> None:
    assert local_folder(str(tmp_path)) == tmp_path


# --- import ---------------------------------------------------------------------


def records(*pairs: tuple[str, datetime]) -> list[CommitRecord]:
    return [CommitRecord(sha, at) for sha, at in pairs]


def test_import_adds_once(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    first = orbit.import_commits("a", records(("s1", T1), ("s2", T2)))
    again = orbit.import_commits("a", records(("s1", T1), ("s2", T2)))
    assert (first.added, first.removed, first.unchanged) == (2, 0, 0)
    assert (again.added, again.removed, again.unchanged) == (0, 0, 2)


def test_rewritten_history_replaces_the_old_commits(orbit: Orbit, session: Session) -> None:
    orbit.add_project("a", name="A")
    orbit.import_commits("a", records(("s1", T1), ("s2", T2)))
    result = orbit.import_commits("a", records(("s1", T1), ("s2-amended", T2)))
    assert (result.added, result.removed, result.unchanged) == (1, 1, 1)
    assert set(session.scalars(select(Commit.sha))) == {"s1", "s2-amended"}


def test_the_same_commit_may_belong_to_two_projects(orbit: Orbit, session: Session) -> None:
    for slug in ("a", "b"):
        orbit.add_project(slug, name=slug)
        orbit.import_commits(slug, records(("s1", T1)))
    assert len(session.scalars(select(Commit)).all()) == 2


def test_commits_are_facts_not_edits(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    before = len(orbit.events())
    orbit.import_commits("a", records(("s1", T1)))
    assert len(orbit.events()) == before


def test_imported_commits_do_not_block_undo_of_a_new_project(
    orbit: Orbit, session: Session
) -> None:
    orbit.add_project("a", name="A")
    orbit.import_commits("a", records(("s1", T1)))
    undo(Orbit(session, actor=Actor.OWNER, clock=orbit.clock))
    assert orbit.list_projects() == []
    session.expire_all()
    assert session.scalars(select(Commit)).all() == []


# --- by itself, while the server runs ---------------------------------------------


def add_project(engine: Engine, slug: str, repo: Path | None) -> None:
    with Session(engine) as session:
        orbit = Orbit(session, actor=Actor.CLAUDE)
        orbit.add_project(slug, name=slug, repo_path=str(repo) if repo else None)
        session.commit()


def count(engine: Engine) -> int:
    with Session(engine) as session:
        return len(session.scalars(select(Commit)).all())


def test_sync_reads_new_commits(engine: Engine, repo: Path) -> None:
    add_project(engine, "a", repo)
    commit(repo, "one")
    sync = RepoSync(engine)
    sync.sync()
    assert count(engine) == 1
    commit(repo, "two")
    sync.sync()
    assert count(engine) == 2


def test_sync_does_nothing_until_git_changes(
    engine: Engine, repo: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    add_project(engine, "a", repo)
    commit(repo, "one")
    sync = RepoSync(engine)
    assert sync.sync() == {"a": 1}
    monkeypatch.setattr("orbit.sync.read_commits", lambda _: pytest.fail("read again"))
    assert sync.sync() == {}


def test_a_missing_folder_keeps_what_is_known(engine: Engine, repo: Path, tmp_path: Path) -> None:
    add_project(engine, "a", repo)
    commit(repo, "one")
    RepoSync(engine).sync()
    repo.rename(tmp_path / "moved")
    RepoSync(engine).sync()
    assert count(engine) == 1


def test_projects_without_a_folder_are_skipped(engine: Engine) -> None:
    add_project(engine, "a", None)
    assert RepoSync(engine).sync() == {}


# --- command ----------------------------------------------------------------------


def test_command_imports_and_reports(
    repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "cli.db"))
    monkeypatch.setenv("ORBIT_ACTOR", "claude")
    commit(repo, "one")
    runner = CliRunner()
    runner.invoke(cli, ["project", "add", "a", "--name", "A", "--repo", str(repo)])
    runner.invoke(cli, ["project", "add", "b", "--name", "B", "--repo", str(tmp_path)])
    runner.invoke(cli, ["project", "add", "c", "--name", "C"])
    result = runner.invoke(cli, ["commit", "import", "--json"])
    assert json.loads(result.stdout) == {
        "projects": {"a": {"added": 1, "removed": 0, "unchanged": 0}},
        "not_repositories": ["b"],
    }
    assert runner.invoke(cli, ["commit", "import"]).exit_code == 0


def wait_for_commits(db: Path) -> int:
    engine = make_engine(db)
    try:
        for _ in range(60):
            if found := count(engine):
                return found
            time.sleep(0.05)
        return 0
    finally:
        engine.dispose()


@pytest.mark.parametrize(("repos", "expected"), [(True, 1), (False, 0)])
def test_server_reads_commits_only_when_told(
    db_file: Path, engine: Engine, repo: Path, repos: bool, expected: int
) -> None:
    """A demo database must not pull in commits of a real folder."""
    add_project(engine, "a", repo)
    commit(repo, "one")
    with TestClient(create_app(db_file, repos=repos), base_url="http://localhost:8420"):
        if not repos:
            time.sleep(0.4)
        found = wait_for_commits(db_file) if repos else count(engine)
    assert found == expected


# --- trouble with git -----------------------------------------------------------------


def test_git_variables_of_a_hook_do_not_lead_astray(
    repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    commit(repo, "one")
    monkeypatch.setenv("GIT_DIR", str(tmp_path / "elsewhere"))
    assert len(read_commits(repo) or []) == 1


def test_a_broken_repository_is_not_read(tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    assert read_commits(tmp_path) is None


def test_one_bad_folder_does_not_stop_the_others(
    engine: Engine, repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def slow(folder: Path) -> list[tuple[str, datetime]] | None:
        if folder == bad:
            raise subprocess.TimeoutExpired("git", 20)
        return read_commits(folder)

    bad = tmp_path / "bad"
    (bad / ".git").mkdir(parents=True)
    commit(repo, "one")
    add_project(engine, "a", bad)
    add_project(engine, "b", repo)
    monkeypatch.setattr("orbit.sync.read_commits", slow)
    sync = RepoSync(engine)
    assert sync.sync() == {"b": 1}
    # And it is not asked again every fifteen seconds until something changes there.
    monkeypatch.setattr("orbit.sync.read_commits", lambda _: pytest.fail("read again"))
    assert sync.sync() == {}


def test_command_without_git_says_so(
    repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "cli.db"))
    runner = CliRunner()
    runner.invoke(cli, ["project", "add", "a", "--name", "A", "--repo", str(repo)])

    def missing(*_: object, **__: object) -> None:
        raise FileNotFoundError("git")

    monkeypatch.setattr("orbit.gitlog.subprocess.run", missing)
    result = runner.invoke(cli, ["commit", "import"])
    assert result.exit_code == 1
    assert "git" in result.output
    assert "Traceback" not in result.output
