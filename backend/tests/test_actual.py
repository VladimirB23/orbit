"""When work really began and ended: read from the journal, not from the plan."""

from datetime import UTC, date, datetime, timedelta

import pytest

from orbit import serialize
from orbit.domain.clock import SystemClock
from orbit.domain.enums import Status
from orbit.domain.rules import Actual, actual_span, earliest_sign
from orbit.domain.service import Orbit
from tests.conftest import TODAY, FakeClock

D1 = date(2026, 11, 1)
D2 = date(2026, 11, 5)
D3 = date(2026, 11, 9)


# --- rules --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("history", "status", "expected"),
    [
        ([], Status.PLANNED, Actual(None, None)),
        ([(Status.PLANNED, D1)], Status.PLANNED, Actual(None, None)),
        ([(Status.PLANNED, D1), (Status.IN_PROGRESS, D2)], Status.IN_PROGRESS, Actual(D2, None)),
        # Pauses do not move the beginning.
        (
            [(Status.IN_PROGRESS, D1), (Status.PAUSED, D2), (Status.IN_PROGRESS, D3)],
            Status.IN_PROGRESS,
            Actual(D1, None),
        ),
        ([(Status.IN_PROGRESS, D1), (Status.DONE, D2)], Status.DONE, Actual(D1, D2)),
        # Closed without ever being in progress: the beginning is unknown, not invented.
        ([(Status.PLANNED, D1), (Status.DONE, D2)], Status.DONE, Actual(None, D2)),
        ([(Status.PLANNED, D1), (Status.CANCELED, D3)], Status.CANCELED, Actual(None, D3)),
        # Reopened: no end any more.
        (
            [(Status.IN_PROGRESS, D1), (Status.DONE, D2), (Status.IN_PROGRESS, D3)],
            Status.IN_PROGRESS,
            Actual(D1, None),
        ),
        # Closed twice: the last time counts.
        (
            [(Status.DONE, D1), (Status.IN_PROGRESS, D2), (Status.DONE, D3)],
            Status.DONE,
            Actual(D2, D3),
        ),
        # Deferred or stuck before any work: not a beginning.
        ([(Status.BLOCKED, D1)], Status.BLOCKED, Actual(None, None)),
    ],
)
def test_actual_span(history: list[tuple[Status, date]], status: Status, expected: Actual) -> None:
    assert actual_span(history, status) == expected


def test_earliest_sign_of_work_is_the_start_or_else_completion() -> None:
    assert earliest_sign(Actual(D1, D2), Status.DONE) == D1
    assert earliest_sign(Actual(None, D2), Status.DONE) == D2
    assert earliest_sign(Actual(None, D2), Status.CANCELED) is None
    assert earliest_sign(Actual(None, None), Status.PLANNED) is None


def test_system_clock_gives_the_local_day_of_a_moment() -> None:
    moment = datetime(2026, 11, 24, 22, 30, tzinfo=UTC)
    assert SystemClock().day_of(moment) == moment.astimezone().date()


def test_json_of_the_cli_has_actual_dates(orbit: Orbit, clock: FakeClock) -> None:
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    m = orbit.add_milestone("a", "M", status=Status.DONE)
    orbit.add_task("a", "T", milestone_id=m.id)
    [node] = orbit.tree()
    data = serialize.project_node(node)
    day = TODAY.isoformat()
    assert data["actual"] == {"start": day, "end": None}
    assert data["milestones"][0]["actual"] == {"start": None, "end": day}
    assert data["milestones"][0]["tasks"][0]["actual"] == {"start": None, "end": None}


# --- in the tree --------------------------------------------------------------


def test_tree_gives_actual_dates_on_every_level(orbit: Orbit, clock: FakeClock) -> None:
    clock.advance(days=-10)
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    t = orbit.add_task("a", "T", milestone_id=m.id)
    clock.advance(days=2)
    orbit.update_task(t.id, status=Status.IN_PROGRESS)
    orbit.update_milestone(m.id, status=Status.IN_PROGRESS)
    orbit.update_project("a", status=Status.IN_PROGRESS)
    clock.advance(days=3)
    orbit.update_task(t.id, status=Status.DONE)

    [project] = orbit.tree()
    milestone = project.milestones[0]
    began = TODAY - timedelta(days=8)
    assert milestone.tasks[0].actual == Actual(began, TODAY - timedelta(days=5))
    assert milestone.actual == Actual(began, None)
    assert project.actual == Actual(began, None)


def test_created_already_in_progress_began_on_that_day(orbit: Orbit) -> None:
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    [project] = orbit.tree()
    assert project.actual == Actual(TODAY, None)


def test_parent_began_when_anything_inside_began(orbit: Orbit, clock: FakeClock) -> None:
    clock.advance(days=-6)
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    top = orbit.add_task("a", "Top", milestone_id=m.id)
    orbit.add_task("a", "Sub", parent_id=top.id, status=Status.DONE)
    clock.advance(days=4)
    orbit.update_milestone(m.id, status=Status.IN_PROGRESS)

    [project] = orbit.tree()
    milestone = project.milestones[0]
    began = TODAY - timedelta(days=6)
    assert milestone.tasks[0].actual == Actual(began, None)
    assert milestone.actual == Actual(began, None)
    assert project.actual == Actual(began, None)


def test_canceled_child_does_not_start_its_parent(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_milestone("a", "M", status=Status.CANCELED)
    [project] = orbit.tree()
    assert project.actual == Actual(None, None)


def test_a_child_never_moves_the_start_past_the_end(orbit: Orbit, clock: FakeClock) -> None:
    """Work added to a milestone that is already closed."""
    clock.advance(days=-5)
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M", status=Status.DONE)
    clock.advance(days=3)
    orbit.add_task("a", "Afterthought", milestone_id=m.id, status=Status.IN_PROGRESS)
    [project] = orbit.tree()
    assert project.milestones[0].actual == Actual(None, TODAY - timedelta(days=5))


def test_history_of_a_deleted_row_does_not_leak_into_a_reused_id(
    orbit: Orbit, clock: FakeClock
) -> None:
    """SQLite gives the id of the last deleted row to the next new one."""
    clock.advance(days=-9)
    orbit.add_project("a", name="A")
    old = orbit.add_task("a", "Old", status=Status.IN_PROGRESS)
    old_id = old.id
    orbit.delete_task(old_id)
    clock.advance(days=9)
    new = orbit.add_task("a", "New")
    assert new.id == old_id

    [project] = orbit.tree()
    assert project.tasks[0].actual == Actual(None, None)


def test_days_are_local_not_utc(orbit: Orbit, clock: FakeClock) -> None:
    """23:30 UTC is already tomorrow for the person: the clock decides, not the column."""
    clock.current = datetime(2026, 11, 20, 23, 30, tzinfo=UTC)
    clock.offset = timedelta(hours=3)
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    [project] = orbit.tree()
    assert project.actual.start == date(2026, 11, 21)
