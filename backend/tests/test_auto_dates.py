"""Deadlines that set themselves: an idea promises nothing, a planned thing has a date."""

import json
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from typer.testing import CliRunner

from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.domain.enums import Actor, Entity, Priority, Status
from orbit.domain.rules import default_due
from orbit.domain.service import Orbit
from orbit.domain.undo import undo
from tests.conftest import TODAY, FakeClock


def d(days: int) -> date:
    return TODAY + timedelta(days=days)


# --- rule -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entity", "priority", "days"),
    [
        (Entity.TASK, Priority.URGENT, 1),
        (Entity.TASK, Priority.HIGH, 3),
        (Entity.TASK, Priority.MEDIUM, 7),
        (Entity.TASK, Priority.NONE, 7),
        (Entity.TASK, Priority.LOW, 14),
        (Entity.MILESTONE, Priority.NONE, 14),
        (Entity.PROJECT, Priority.URGENT, 30),
    ],
)
def test_how_far(entity: Entity, priority: Priority, days: int) -> None:
    assert default_due(entity, priority, start=None, today=TODAY, limits=[]) == d(days)


def test_counts_from_a_start_in_the_future() -> None:
    assert default_due(Entity.TASK, Priority.HIGH, d(10), TODAY, []) == d(13)
    assert default_due(Entity.TASK, Priority.HIGH, d(-10), TODAY, []) == d(3)


def test_never_later_than_what_it_is_a_part_of() -> None:
    assert default_due(Entity.TASK, Priority.LOW, None, TODAY, [d(5), None, d(9)]) == d(5)


def test_a_limit_that_has_passed_is_no_limit() -> None:
    """Otherwise the new thing would be overdue at birth."""
    assert default_due(Entity.TASK, Priority.LOW, None, TODAY, [d(-1)]) == d(14)
    assert default_due(Entity.TASK, Priority.HIGH, d(10), TODAY, [d(5)]) == d(13)


# --- service ------------------------------------------------------------------------


@pytest.fixture
def auto(session: Session, clock: FakeClock) -> Orbit:
    orbit = Orbit(session, actor=Actor.CLAUDE, clock=clock, auto_dates=True)
    orbit.add_project("a", name="A")
    return orbit


def test_off_unless_asked(orbit: Orbit) -> None:
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    assert orbit.get_project("a").due_date is None
    assert orbit.add_task("a", "T", status=Status.PLANNED).due_date is None


def test_new_planned_things_get_a_date(auto: Orbit) -> None:
    assert auto.add_project("b", name="B", status=Status.IN_PROGRESS).due_date == d(30)
    assert auto.add_milestone("a", "M").due_date == d(14)
    assert auto.add_task("a", "T", status=Status.PLANNED, priority=3).due_date == d(3)
    assert auto.add_task("a", "T", status=Status.IN_PROGRESS).due_date == d(7)


def test_ideas_and_closed_things_do_not(auto: Orbit) -> None:
    assert auto.get_project("a").due_date is None
    assert auto.add_task("a", "Idea").due_date is None
    assert auto.add_task("a", "Done", status=Status.DONE).due_date is None
    assert auto.add_task("a", "Waits", status=Status.PAUSED).due_date is None


def test_an_idea_taken_into_the_plan_gets_a_date(auto: Orbit) -> None:
    task = auto.add_task("a", "Idea")
    assert auto.update_task(task.id, status=Status.PLANNED).due_date == d(7)
    milestone = auto.add_milestone("a", "M", status=Status.BACKLOG)
    assert auto.update_milestone(milestone.id, status=Status.IN_PROGRESS).due_date == d(14)
    assert auto.update_project("a", status=Status.PLANNED).due_date == d(30)


def test_a_date_set_by_a_person_wins(auto: Orbit) -> None:
    assert auto.add_task("a", "T", status=Status.PLANNED, due_date=d(1)).due_date == d(1)
    task = auto.add_task("a", "Idea", due_date=d(2))
    assert auto.update_task(task.id, status=Status.PLANNED).due_date == d(2)
    other = auto.add_task("a", "Idea")
    changed = auto.update_task(other.id, status=Status.PLANNED, due_date=d(4))
    assert changed.due_date == d(4)


def test_a_cleared_date_stays_cleared(auto: Orbit) -> None:
    task = auto.add_task("a", "T", status=Status.PLANNED)
    auto.update_task(task.id, due_date=None)
    assert auto.update_task(task.id, title="Other").due_date is None
    assert auto.update_task(task.id, status=Status.IN_PROGRESS).due_date is None
    idea = auto.add_task("a", "Idea")
    assert auto.update_task(idea.id, status=Status.PLANNED, due_date=None).due_date is None


def test_not_later_than_the_parents(auto: Orbit) -> None:
    auto.update_project("a", due_date=d(10))
    m = auto.add_milestone("a", "M")
    assert m.due_date == d(10)
    auto.update_milestone(m.id, due_date=d(5))
    task = auto.add_task("a", "T", milestone_id=m.id, status=Status.PLANNED)
    assert task.due_date == d(5)
    auto.update_task(task.id, due_date=d(2))
    child = auto.add_task("a", "C", parent_id=task.id, status=Status.PLANNED)
    assert child.due_date == d(2)


def test_journal_says_it_was_the_system(auto: Orbit) -> None:
    task = auto.add_task("a", "T", status=Status.PLANNED)
    [created, dated] = auto.events(entity="task", entity_id=task.id)
    assert json.loads(created.new_value or "")["due_date"] is None
    assert (dated.actor, dated.field, dated.new_value) == ("system", "due_date", str(d(7)))
    assert created.batch == dated.batch


def test_undo_takes_back_both(auto: Orbit, session: Session) -> None:
    idea = auto.add_task("a", "Idea")
    second = Orbit(session, actor=Actor.CLAUDE, clock=auto.clock, auto_dates=True)
    second.update_task(idea.id, status=Status.PLANNED)
    undo(Orbit(session, actor=Actor.CLAUDE, clock=auto.clock, auto_dates=True))
    row = auto.get_task(idea.id)
    assert (row.status, row.due_date) == ("backlog", None)


def test_undo_of_creation_removes_the_row(auto: Orbit, session: Session) -> None:
    second = Orbit(session, actor=Actor.CLAUDE, clock=auto.clock, auto_dates=True)
    second.add_task("a", "T", status=Status.PLANNED)
    undone = undo(Orbit(session, actor=Actor.CLAUDE, clock=auto.clock, auto_dates=True))
    assert auto.list_tasks("a") == []
    assert (undone.action, undone.title) == ("create", "T")  # not "a date has changed"


# --- from outside -------------------------------------------------------------------


@pytest.fixture
def client(db_file: Path, clock: FakeClock) -> Iterator[TestClient]:
    app = create_app(db_file, clock=clock, auto_dates=True)
    with TestClient(app, base_url="http://localhost:8420") as client:
        yield client


def test_api_answers_with_the_date(client: TestClient) -> None:
    client.post("/api/v1/projects", json={"slug": "a", "name": "A"})
    task = client.post("/api/v1/projects/a/tasks", json={"title": "T"}).json()
    assert task["due_date"] is None
    patched = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "planned"}).json()
    assert patched["due_date"] == d(7).isoformat()


@pytest.mark.parametrize(("line", "dated"), [("auto_dates = true\n", True), ("", False)])
def test_cli_follows_the_settings_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, line: str, dated: bool
) -> None:
    (tmp_path / "cli.toml").write_text(line, encoding="utf-8")
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "cli.db"))
    runner = CliRunner()
    runner.invoke(cli, ["project", "add", "a", "--name", "A"])
    out = runner.invoke(cli, ["task", "add", "a", "T", "--status", "planned", "--json"])
    task: dict[str, Any] = json.loads(out.stdout)
    assert (task["due_date"] is not None) is dated
