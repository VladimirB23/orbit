"""What a collapsed row must tell: deadlines close by, current focus, trouble inside."""

from datetime import timedelta

import pytest

from orbit.domain.enums import Entity, Status
from orbit.domain.rules import is_upcoming
from orbit.domain.service import FocusKind, Orbit
from tests.conftest import TODAY


@pytest.mark.parametrize(
    ("offset", "status", "expected"),
    [
        (0, Status.PLANNED, True),
        (7, Status.PLANNED, True),
        (8, Status.PLANNED, False),
        (-1, Status.PLANNED, False),
        (3, Status.DONE, False),
        (3, Status.CANCELED, False),
    ],
)
def test_upcoming_is_open_and_due_within_the_horizon(
    offset: int, status: Status, expected: bool
) -> None:
    assert is_upcoming(TODAY + timedelta(days=offset), status, TODAY, days=7) is expected


def test_item_without_due_date_is_never_upcoming() -> None:
    assert is_upcoming(None, Status.PLANNED, TODAY, days=7) is False


def test_tree_marks_upcoming_items_on_every_level(orbit: Orbit) -> None:
    soon = TODAY + timedelta(days=2)
    orbit.add_project("a", name="A", due_date=soon)
    m = orbit.add_milestone("a", "M", due_date=soon)
    orbit.add_task("a", "T", milestone_id=m.id, due_date=soon)
    [node] = orbit.tree()
    assert node.upcoming
    assert node.milestones[0].upcoming
    assert node.milestones[0].tasks[0].upcoming


def test_signals_count_trouble_below_the_row_not_the_row_itself(orbit: Orbit) -> None:
    late = TODAY - timedelta(days=1)
    orbit.add_project("a", name="A", status=Status.BLOCKED, due_date=late)
    m = orbit.add_milestone("a", "M", due_date=late)
    parent = orbit.add_task("a", "Parent", milestone_id=m.id, status=Status.BLOCKED)
    orbit.add_task("a", "Child", parent_id=parent.id, due_date=TODAY)
    orbit.add_task("a", "Loose", status=Status.IN_PROGRESS)

    [project] = orbit.tree()
    milestone = project.milestones[0]
    task = milestone.tasks[0]

    assert (project.signals.overdue, project.signals.blocked) == (1, 1)
    assert (project.signals.upcoming, project.signals.in_progress) == (1, 1)
    assert (milestone.signals.overdue, milestone.signals.blocked) == (0, 1)
    assert milestone.signals.upcoming == 1
    assert (task.signals.blocked, task.signals.upcoming) == (0, 1)


def test_signals_of_a_leaf_are_empty(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    [node] = orbit.tree()
    assert (node.signals.overdue, node.signals.blocked, node.signals.upcoming) == (0, 0, 0)


def test_focus_is_the_first_milestone_in_progress(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_milestone("a", "Planned")
    running = orbit.add_milestone("a", "Running", status=Status.IN_PROGRESS)
    orbit.add_milestone("a", "Also running", status=Status.IN_PROGRESS)
    [node] = orbit.tree()
    assert node.focus is not None
    assert (node.focus.entity, node.focus.id) == (Entity.MILESTONE, running.id)
    assert (node.focus.title, node.focus.kind) == ("Running", FocusKind.CURRENT)


def test_focus_falls_back_to_a_task_in_progress(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_milestone("a", "Planned")
    task = orbit.add_task("a", "Running task", status=Status.IN_PROGRESS)
    [node] = orbit.tree()
    assert node.focus is not None
    assert (node.focus.entity, node.focus.id) == (Entity.TASK, task.id)
    assert node.focus.kind is FocusKind.CURRENT


def test_focus_falls_back_to_the_next_open_milestone(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_milestone("a", "Done", status=Status.DONE)
    nxt = orbit.add_milestone("a", "Next")
    [node] = orbit.tree()
    assert node.focus is not None
    assert (node.focus.id, node.focus.kind) == (nxt.id, FocusKind.NEXT)


def test_project_without_open_work_has_no_focus(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_milestone("a", "Done", status=Status.DONE)
    orbit.add_task("a", "Backlog idea")
    [node] = orbit.tree()
    assert node.focus is None
