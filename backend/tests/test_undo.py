"""Undo: the last action of the same person is taken back, others' work stays."""

from collections.abc import Callable
from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from orbit.db.models import Task
from orbit.domain.enums import Action, Actor, Entity, Status
from orbit.domain.errors import ConflictError, NotFoundError
from orbit.domain.rules import Actual, canceled_out
from orbit.domain.service import Orbit, snapshot
from orbit.domain.undo import UNDO_WINDOW, redo, undo
from tests.conftest import TODAY, FakeClock

type Do = Callable[..., Orbit]


@pytest.fixture
def do(session: Session, clock: FakeClock) -> Do:
    """Every call is one action: a new Orbit, as one request or one command."""

    def make(actor: Actor = Actor.OWNER) -> Orbit:
        clock.advance(seconds=1)
        return Orbit(session, actor=actor, clock=clock)

    return make


# --- which actions are in force -------------------------------------------------


def test_undone_actions_cancel_out() -> None:
    # Newest first: (action, what it takes back).
    assert canceled_out([("u", "b"), ("b", None), ("a", None)]) == {"u", "b"}
    # Redo brings the action back.
    assert canceled_out([("r", "u"), ("u", "b"), ("b", None)]) == {"r", "u"}
    assert canceled_out([("u2", "b"), ("r", "u"), ("u", "b"), ("b", None)]) == {
        "u2",
        "b",
        "r",
        "u",
    }
    assert canceled_out([]) == set()


# --- fields -------------------------------------------------------------------


def test_takes_back_a_field(do: Do) -> None:
    do().add_project("a", name="A")
    do().update_project("a", summary="Short")
    done = undo(do())
    assert do().get_project("a").summary is None
    assert (done.entity, done.title, done.action) == (Entity.PROJECT, "A", Action.UPDATE)
    assert done.fields == ["summary"]


def test_one_action_with_several_fields_goes_back_at_once(do: Do) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T", start_date=TODAY, due_date=TODAY)
    later = TODAY + timedelta(days=5)
    do().update_task(t.id, start_date=later, due_date=later, priority=3)
    undo(do())
    row = do().get_task(t.id)
    assert (row.start_date, row.due_date, row.priority) == (TODAY, TODAY, 0)


def test_goes_further_back_and_forth(do: Do) -> None:
    do().add_project("a", name="A")
    for name in ("B", "C", "D"):
        do().update_project("a", name=name)
    names = []
    for step in (undo, undo, redo, redo):
        step(do())
        names.append(do().get_project("a").name)
    assert names == ["C", "B", "C", "D"]
    with pytest.raises(NotFoundError):
        redo(do())
    for _ in range(3):
        undo(do())
    assert do().get_project("a").name == "A"


def test_a_new_action_ends_the_way_forward(do: Do) -> None:
    do().add_project("a", name="A")
    do().update_project("a", name="B")
    undo(do())
    do().update_project("a", summary="New")
    with pytest.raises(NotFoundError):
        redo(do())
    assert do().get_project("a").name == "A"


def test_archiving_goes_back(do: Do) -> None:
    do().add_project("a", name="A")
    do().archive_project("a")
    undo(do())
    assert do().get_project("a").archived_at is None
    redo(do())
    assert do().get_project("a").archived_at is not None


def test_status_brings_back_the_moment_it_was_done(do: Do, clock: FakeClock) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T")
    do().update_task(t.id, status=Status.DONE)
    finished = do().get_task(t.id).done_at
    clock.advance(hours=3)
    do().update_task(t.id, status=Status.IN_PROGRESS)
    assert do().get_task(t.id).done_at is None
    undo(do())
    assert do().get_task(t.id).done_at == finished


def test_closing_rules_do_not_stop_a_way_back(do: Do) -> None:
    do().add_project("a", name="A")
    parent = do().add_task("a", "Parent")
    do().add_task("a", "Child", parent_id=parent.id)
    do().update_task(parent.id, status=Status.DONE, force=True)
    do().update_task(parent.id, status=Status.IN_PROGRESS)
    undo(do())
    assert do().get_task(parent.id).status == Status.DONE


# --- creation and deletion -----------------------------------------------------


def test_an_added_row_disappears_and_returns(do: Do) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T", comment="why")
    before = snapshot(t)
    undone = undo(do())
    assert (undone.action, undone.title) == (Action.CREATE, "T")
    with pytest.raises(NotFoundError):
        do().get_task(before["id"])
    redo(do())
    after = snapshot(do().get_task(before["id"]))
    assert {**after, "updated_at": 0} == {**before, "updated_at": 0}


def test_an_empty_new_project_disappears(do: Do) -> None:
    do().add_project("a", name="A")
    undo(do())
    assert do().list_projects(include_archived=True) == []


def test_a_row_with_something_inside_is_not_taken_away(do: Do) -> None:
    do().add_project("a", name="A")
    do(Actor.CLAUDE).add_task("a", "From Claude")
    with pytest.raises(ConflictError):
        undo(do())


def test_a_deleted_branch_returns_whole(do: Do, session: Session) -> None:
    do().add_project("a", name="A")
    m = do().add_milestone("a", "M")
    top = do().add_task("a", "Top", milestone_id=m.id)
    do().add_task("a", "Sub", parent_id=top.id, status=Status.DONE)
    before = [snapshot(row) for row in do().list_tasks("a")]
    m_id = m.id
    do().delete_milestone(m_id, force=True)
    assert do().list_tasks("a") == []

    undone = undo(do())
    assert (undone.action, undone.title, undone.count) == (Action.DELETE, "M", 3)
    after = [snapshot(row) for row in do().list_tasks("a")]
    strip = [{**row, "updated_at": 0} for row in after]
    assert strip == [{**row, "updated_at": 0} for row in before]
    assert do().get_milestone(m_id).name == "M"
    redo(do())
    assert do().list_tasks("a") == []


def test_a_reused_id_is_not_overwritten(do: Do) -> None:
    do().add_project("a", name="A")
    old = do().add_task("a", "Old")
    old_id = old.id
    do().delete_task(old_id)
    new = do(Actor.CLAUDE).add_task("a", "New")
    assert new.id == old_id
    with pytest.raises(ConflictError):
        undo(do())
    assert do().get_task(old_id).title == "New"


# --- other people ---------------------------------------------------------------


def test_does_not_touch_the_work_of_others(do: Do) -> None:
    do().add_project("a", name="A")
    do().update_project("a", summary="Mine")
    do(Actor.CLAUDE).update_project("a", name="Claude's name")
    undo(do())
    row = do().get_project("a")
    assert (row.summary, row.name) == (None, "Claude's name")


def test_claude_takes_back_only_its_own(do: Do) -> None:
    do().add_project("a", name="A")
    do(Actor.CLAUDE).update_project("a", summary="Claude")
    do().update_project("a", name="B")
    undo(do(Actor.CLAUDE))
    row = do().get_project("a")
    assert (row.summary, row.name) == (None, "B")


def test_refuses_when_the_field_has_changed_since(do: Do) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T")
    do().update_task(t.id, status=Status.IN_PROGRESS)
    do(Actor.CLAUDE).update_task(t.id, status=Status.DONE)
    with pytest.raises(ConflictError):
        undo(do())
    assert do().get_task(t.id).status == Status.DONE


def test_refuses_when_the_row_is_gone(do: Do) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T")
    do().update_task(t.id, title="T2")
    do(Actor.CLAUDE).delete_task(t.id)
    with pytest.raises(ConflictError):
        undo(do())


def test_refuses_a_loop_of_parents(do: Do, session: Session) -> None:
    do().add_project("a", name="A")
    one = do().add_task("a", "One")
    two = do().add_task("a", "Two", parent_id=one.id)
    do().update_task(two.id, parent_id=None)
    do(Actor.CLAUDE).update_task(one.id, parent_id=two.id)
    with pytest.raises(ConflictError):
        undo(do())


def test_refuses_dates_that_no_longer_fit_together(do: Do) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T", due_date=TODAY)
    do().update_task(t.id, due_date=TODAY + timedelta(days=9))
    do(Actor.CLAUDE).update_task(t.id, start_date=TODAY + timedelta(days=5))
    with pytest.raises(ConflictError):
        undo(do())


# --- limits --------------------------------------------------------------------


def test_nothing_to_undo(do: Do) -> None:
    with pytest.raises(NotFoundError):
        undo(do())


def test_yesterdays_work_is_safe_from_a_stray_key(do: Do, clock: FakeClock) -> None:
    do().add_project("a", name="A")
    clock.advance(hours=UNDO_WINDOW.total_seconds() / 3600 + 1)
    with pytest.raises(NotFoundError):
        undo(do())


def test_the_journal_keeps_both_the_action_and_its_undoing(do: Do) -> None:
    do().add_project("a", name="A")
    do().update_project("a", name="B")
    undo(do())
    names = [(e.old_value, e.new_value) for e in do().events() if e.field == "name"]
    assert names == [("A", "B"), ("B", "A")]


def test_an_undone_status_leaves_no_trace_in_the_facts(do: Do, clock: FakeClock) -> None:
    """A slip of the hand must not move the real beginning and end of work."""
    clock.advance(days=-10)
    do().add_project("a", name="A")
    t = do().add_task("a", "T", status=Status.IN_PROGRESS)
    clock.advance(days=3)
    do().update_task(t.id, status=Status.DONE)
    clock.advance(days=7)
    do().update_task(t.id, status=Status.IN_PROGRESS)
    undo(do())

    [project] = do().tree()
    began = TODAY - timedelta(days=10)
    assert project.tasks[0].actual == Actual(began, TODAY - timedelta(days=7))


def test_a_returned_row_keeps_its_history(do: Do, clock: FakeClock) -> None:
    clock.advance(days=-4)
    do().add_project("a", name="A")
    t = do().add_task("a", "T", status=Status.IN_PROGRESS)
    clock.advance(days=4)
    do().delete_task(t.id)
    undo(do())
    [project] = do().tree()
    assert project.tasks[0].actual == Actual(date(2026, 11, 20), None)


def test_a_returned_row_is_an_ordinary_row(do: Do, session: Session) -> None:
    do().add_project("a", name="A")
    t = do().add_task("a", "T", due_date=TODAY)
    t_id = t.id
    do().delete_task(t_id)
    undo(do())
    session.expire_all()
    row = session.get(Task, t_id)
    assert row is not None
    assert row.due_date == TODAY
    do().update_task(t_id, title="Renamed")
    undo(do())
    assert do().get_task(t_id).title == "T"
