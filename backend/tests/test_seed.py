import json
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session
from typer.testing import CliRunner

from orbit.cli import app
from orbit.domain.enums import Actor, Status
from orbit.domain.service import Orbit
from orbit.seed import seed_demo
from tests.conftest import TODAY, FakeClock


def test_demo_has_overdue_upcoming_and_every_status(session: Session, clock: FakeClock) -> None:
    seed_demo(session, today=TODAY)
    orbit = Orbit(session, actor=Actor.SYSTEM, clock=clock)
    report = orbit.status_report(days=14)
    assert report.overdue
    assert report.upcoming
    assert report.blocked
    statuses = {t.status for t in orbit.list_tasks()}
    statuses |= {p.status for p in orbit.list_projects(include_archived=True)}
    assert statuses >= {s.value for s in Status}


def test_demo_history_is_spread_over_weeks_with_two_actors(
    session: Session, clock: FakeClock
) -> None:
    seed_demo(session, today=TODAY)
    events = Orbit(session, actor=Actor.SYSTEM, clock=clock).events()
    days = {e.at.date() for e in events}
    assert len(days) >= 10
    assert {e.actor for e in events} == {"vladimir", "claude"}
    assert max(days) <= TODAY


def test_demo_has_an_archived_project(session: Session, clock: FakeClock) -> None:
    seed_demo(session, today=TODAY)
    orbit = Orbit(session, actor=Actor.SYSTEM, clock=clock)
    assert len(orbit.list_projects(include_archived=True)) > len(orbit.list_projects())


# --- CLI ----------------------------------------------------------------------


@pytest.fixture
def runner(monkeypatch: pytest.MonkeyPatch) -> CliRunner:
    monkeypatch.delenv("ORBIT_DB", raising=False)
    monkeypatch.delenv("ORBIT_ACTOR", raising=False)
    return CliRunner()


def invoke(runner: CliRunner, *args: str) -> Any:
    return runner.invoke(app, list(args))


def test_seed_requires_demo_flag(runner: CliRunner, tmp_path: Path) -> None:
    result = invoke(runner, "--db", str(tmp_path / "d.db"), "seed")
    assert result.exit_code == 1
    assert "--demo" in result.output


def test_seed_fills_an_empty_database(runner: CliRunner, tmp_path: Path) -> None:
    db = str(tmp_path / "d.db")
    result = invoke(runner, "--db", db, "seed", "--demo", "--json")
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["projects"] >= 4
    projects = json.loads(invoke(runner, "--db", db, "project", "list", "--json").stdout)
    assert projects


def test_seed_refuses_non_empty_database_without_reset(runner: CliRunner, tmp_path: Path) -> None:
    db = str(tmp_path / "d.db")
    invoke(runner, "--db", db, "seed", "--demo")
    result = invoke(runner, "--db", db, "seed", "--demo")
    assert result.exit_code == 4
    assert "--reset" in result.output
    assert invoke(runner, "--db", db, "seed", "--demo", "--reset").exit_code == 0


def test_seed_never_touches_the_real_database(
    runner: CliRunner, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    real = tmp_path / "orbit.db"
    monkeypatch.setattr("orbit.cli.commands.DEFAULT_DB_PATH", real)
    result = invoke(runner, "--db", str(real), "seed", "--demo", "--reset")
    assert result.exit_code == 1
    assert not real.exists()


def test_seed_defaults_to_demo_db(
    runner: CliRunner, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    demo = tmp_path / "demo.db"
    monkeypatch.setattr("orbit.cli.commands.DEMO_DB_PATH", demo)
    monkeypatch.setattr("orbit.cli.commands.DEFAULT_DB_PATH", tmp_path / "orbit.db")
    assert invoke(runner, "seed", "--demo").exit_code == 0
    assert demo.exists()
    assert not (tmp_path / "orbit.db").exists()
