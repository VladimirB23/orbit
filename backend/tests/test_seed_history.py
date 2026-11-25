"""Half a year of fictional work: enough for every chart and for a public dashboard."""

import json
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from statistics import median
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from typer.testing import CliRunner

from orbit.cli import app
from orbit.db.engine import ensure_schema, make_engine
from orbit.db.models import Event, Project
from orbit.domain import analytics as a
from orbit.domain.enums import Actor
from orbit.domain.rules import Attention
from orbit.domain.service import Orbit
from orbit.seed import ReplayClock
from orbit.seed_history import DAYS, VACATION, seed_history

UNTIL = date(2026, 11, 25)
# The size of the effect is small against the noise of one short period: look at whole halves.
HALF = UNTIL - timedelta(days=DAYS // 2)


@pytest.fixture(scope="module")
def history(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Orbit]:
    engine = make_engine(tmp_path_factory.mktemp("history") / "demo.db")
    ensure_schema(engine)
    with Session(engine) as session:
        seed_history(session, UNTIL)
        session.commit()
        yield Orbit(session, Actor.SYSTEM, ReplayClock(UNTIL))
    engine.dispose()


@pytest.fixture(scope="module")
def whole(history: Orbit) -> a.Analytics:
    return a.analyze(history, a.all_time(history))


def test_there_is_enough_of_everything(whole: a.Analytics) -> None:
    assert len(whole.steps) >= 24
    assert whole.totals.closed.value >= 120
    assert whole.totals.sessions.value >= 100
    assert whole.totals.commits.value >= 150
    assert sum(n > 0 for n in whole.closed) >= len(whole.closed) * 0.75
    assert len(whole.focus) >= 8


def test_dirty_data_is_there_too(whole: a.Analytics) -> None:
    """A chart that never meets a task without a start has not been tested."""
    assert whole.cycle.known >= 80
    assert whole.cycle.no_start >= 5
    assert whole.cycle.born_closed >= 3
    assert whole.plan.compared >= 12
    assert 0.2 <= whole.plan.late / whole.plan.compared <= 0.8
    assert any(item.moves for item in whole.plan.items)


def test_the_last_month_has_a_focus_and_a_neglected_project(history: Orbit) -> None:
    month = a.analyze(history, a.Period(UNTIL - timedelta(days=29), UNTIL))
    kinds = {row.attention for row in month.focus}
    assert {Attention.LOW, Attention.HIGH} <= kinds
    assert next(r for r in month.focus if r.slug == "job-search").attention is Attention.LOW
    assert any(item.days < 0 for item in month.deadlines)
    assert any(item.days > 0 for item in month.deadlines)
    assert sum(row.working for row in month.focus) >= 3
    assert sum(row.stuck for row in month.focus) >= 1


# --- stories to find in a dashboard ---------------------------------------------------


def test_tasks_became_faster_in_the_second_half(whole: a.Analytics) -> None:
    first = [i.days for i in whole.cycle.items if i.started < HALF]
    second = [i.days for i in whole.cycle.items if i.started >= HALF]
    assert min(len(first), len(second)) >= 25
    assert median(first) >= median(second) + 1


def test_data_milestones_are_late_more_often(whole: a.Analytics) -> None:
    data = [i.days for i in whole.plan.items if "data" in i.name.lower()]
    other = [i.days for i in whole.plan.items if "data" not in i.name.lower()]
    assert min(len(data), len(other)) >= 4
    assert sum(data) / len(data) >= sum(other) / len(other) + 2


def test_vacation_is_a_hole(history: Orbit) -> None:
    first, last = (UNTIL - timedelta(days=n) for n in VACATION)
    hole = a.analyze(history, a.Period(first, last)).totals
    assert (hole.sessions.value, hole.commits.value) == (0, 0)
    assert hole.closed.value <= 1


# --- honest history ---------------------------------------------------------------------


def test_nothing_happens_in_the_future(history: Orbit) -> None:
    last = history.session.scalar(select(func.max(Event.at)))
    assert last is not None
    assert history.clock.day_of(last) <= UNTIL
    assert all(history.clock.day_of(s.ended_at) <= UNTIL for s in history.sessions())


def test_the_journal_goes_forward_in_time(history: Orbit) -> None:
    moments = list(history.session.scalars(select(Event.at).order_by(Event.id)))
    assert moments == sorted(moments)
    assert len(moments) > 600


def test_the_same_day_gives_the_same_history(tmp_path: Path, history: Orbit) -> None:
    engine = make_engine(tmp_path / "again.db")
    ensure_schema(engine)
    with Session(engine) as session:
        seed_history(session, UNTIL)
        again = [(e.at, e.entity, e.entity_id, e.new_value) for e in session.scalars(select(Event))]
    engine.dispose()
    first = history.session.scalars(select(Event))
    assert again == [(e.at, e.entity, e.entity_id, e.new_value) for e in first]


def test_there_are_no_real_paths_or_names(history: Orbit) -> None:
    for project in history.session.scalars(select(Project)):
        assert project.repo_path in (None, f"D:\\Projects\\{project.slug}")
        assert project.obsidian_path is None
    assert all(s.folder is None for s in history.sessions())


# --- command -------------------------------------------------------------------------------


@pytest.fixture
def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.delenv("ORBIT_DB", raising=False)
    monkeypatch.setattr("orbit.cli.commands.HISTORY_DB_PATH", tmp_path / "demo-half-year.db")
    runner = CliRunner()

    def invoke(*args: str) -> Any:
        return runner.invoke(app, list(args))

    return invoke


def test_command_fills_its_own_demo_file(run: Any, tmp_path: Path) -> None:
    result = run("seed", "--demo", "--half-year", "--until", "2026-11-25", "--json")
    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)
    assert Path(data["path"]) == tmp_path / "demo-half-year.db"
    assert data["tasks"] > 150
    again = run("seed", "--demo", "--half-year", "--json")
    assert again.exit_code == 4


def test_until_is_only_for_the_history(run: Any) -> None:
    result = run("seed", "--demo", "--until", "2026-11-25")
    assert result.exit_code == 1
    assert "--half-year" in result.output
    assert run("seed", "--demo", "--half-year", "--until", "soon").exit_code == 1
