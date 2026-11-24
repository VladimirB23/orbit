from datetime import date, timedelta

import pytest

from orbit.domain.enums import Status
from orbit.domain.errors import ConflictError, NotFoundError, ValidationError
from orbit.domain.service import Orbit
from tests.conftest import NOW, TODAY, FakeClock

# --- projects ---------------------------------------------------------------


def test_add_project_sets_defaults_and_timestamps(orbit: Orbit) -> None:
    p = orbit.add_project("atlas", name="Atlas")
    assert p.id > 0
    assert (p.slug, p.name, p.status, p.priority) == ("atlas", "Atlas", "backlog", 0)
    assert p.created_at == NOW
    assert p.updated_at == NOW
    assert p.archived_at is None


def test_projects_get_increasing_positions(orbit: Orbit) -> None:
    a = orbit.add_project("a", name="A")
    b = orbit.add_project("b", name="B")
    assert b.position == a.position + 1


def test_duplicate_slug_is_rejected(orbit: Orbit) -> None:
    orbit.add_project("orbit", name="Orbit")
    with pytest.raises(ValidationError, match="already exists"):
        orbit.add_project("orbit", name="Orbit 2")


@pytest.mark.parametrize("slug", ["Atlas", "geo_cats", "-x", "", "GEO"])
def test_invalid_slug_is_rejected(orbit: Orbit, slug: str) -> None:
    with pytest.raises(ValidationError, match="slug"):
        orbit.add_project(slug, name="X")


def test_empty_name_is_rejected(orbit: Orbit) -> None:
    with pytest.raises(ValidationError, match="name"):
        orbit.add_project("x", name="   ")


def test_summary_longer_than_140_is_rejected(orbit: Orbit) -> None:
    with pytest.raises(ValidationError, match="140"):
        orbit.add_project("x", name="X", summary="a" * 141)


def test_start_after_due_is_rejected(orbit: Orbit) -> None:
    with pytest.raises(ValidationError, match="start"):
        orbit.add_project("x", name="X", start_date=TODAY, due_date=TODAY - timedelta(days=1))


def test_unknown_project_raises_not_found(orbit: Orbit) -> None:
    with pytest.raises(NotFoundError, match="nope"):
        orbit.get_project("nope")


def test_archive_hides_project_from_default_list(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_project("b", name="B")
    archived = orbit.archive_project("b")
    assert archived.archived_at == NOW
    assert [p.slug for p in orbit.list_projects()] == ["a"]
    assert [p.slug for p in orbit.list_projects(include_archived=True)] == ["a", "b"]


# --- milestones -------------------------------------------------------------


def test_add_milestone_defaults_to_planned(orbit: Orbit) -> None:
    orbit.add_project("orbit", name="Orbit")
    m = orbit.add_milestone("orbit", "Core and CLI", due_date=date(2026, 11, 28))
    assert (m.name, m.status, m.due_date) == ("Core and CLI", "planned", date(2026, 11, 28))


def test_milestone_positions_are_per_project(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_project("b", name="B")
    a1 = orbit.add_milestone("a", "A1")
    b1 = orbit.add_milestone("b", "B1")
    a2 = orbit.add_milestone("a", "A2")
    assert (a1.position, b1.position, a2.position) == (0, 0, 1)


# --- tasks ------------------------------------------------------------------


def test_add_task_defaults(orbit: Orbit) -> None:
    orbit.add_project("orbit", name="Orbit")
    t = orbit.add_task("orbit", "DB schema")
    assert (t.title, t.status, t.priority, t.milestone_id, t.parent_id) == (
        "DB schema",
        "backlog",
        0,
        None,
        None,
    )


def test_task_milestone_must_belong_to_same_project(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_project("b", name="B")
    mb = orbit.add_milestone("b", "B1")
    with pytest.raises(ValidationError, match="milestone"):
        orbit.add_task("a", "T", milestone_id=mb.id)


def test_subtask_inherits_parent_milestone(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    parent = orbit.add_task("a", "Parent", milestone_id=m.id)
    child = orbit.add_task("a", "Child", parent_id=parent.id)
    assert child.milestone_id == m.id


def test_parent_must_belong_to_same_project(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_project("b", name="B")
    tb = orbit.add_task("b", "T")
    with pytest.raises(ValidationError, match="parent"):
        orbit.add_task("a", "Child", parent_id=tb.id)


def test_comment_longer_than_280_is_rejected(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    with pytest.raises(ValidationError, match="280"):
        orbit.add_task("a", "T", comment="x" * 281)


def test_unknown_task_raises_not_found(orbit: Orbit) -> None:
    with pytest.raises(NotFoundError):
        orbit.get_task(404)


# --- updates and status rules -----------------------------------------------


def test_update_task_status_to_done_sets_done_at(orbit: Orbit, clock: FakeClock) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T")
    clock.advance(hours=2)
    t = orbit.update_task(t.id, status=Status.DONE)
    assert t.status == "done"
    assert t.done_at == clock.current
    assert t.updated_at == clock.current


def test_reopening_task_clears_done_at(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T", status=Status.DONE)
    assert t.done_at == NOW
    t = orbit.update_task(t.id, status=Status.IN_PROGRESS)
    assert t.done_at is None


def test_update_with_same_values_changes_nothing(orbit: Orbit, clock: FakeClock) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T")
    clock.advance(hours=1)
    t = orbit.update_task(t.id, title="T")
    assert t.updated_at == NOW


def test_update_rejects_unknown_field(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T")
    with pytest.raises(ValidationError, match="project_id"):
        orbit.update_task(t.id, project_id=2)


def test_update_can_clear_optional_field(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T", due_date=TODAY)
    t = orbit.update_task(t.id, due_date=None)
    assert t.due_date is None


def test_closing_milestone_with_open_tasks_needs_force(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    orbit.add_task("a", "Open", milestone_id=m.id)
    with pytest.raises(ConflictError, match="force"):
        orbit.update_milestone(m.id, status=Status.DONE)
    m = orbit.update_milestone(m.id, status=Status.DONE, force=True)
    assert m.status == "done"


def test_closing_milestone_with_closed_tasks_is_allowed(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    orbit.add_task("a", "Done", milestone_id=m.id, status=Status.DONE)
    orbit.add_task("a", "Dropped", milestone_id=m.id, status=Status.CANCELED)
    assert orbit.update_milestone(m.id, status=Status.DONE).status == "done"


def test_closing_project_with_open_tasks_needs_force(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_task("a", "Open")
    with pytest.raises(ConflictError):
        orbit.update_project("a", status=Status.CANCELED)


def test_closing_task_with_open_subtasks_needs_force(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    parent = orbit.add_task("a", "Parent")
    orbit.add_task("a", "Child", parent_id=parent.id)
    with pytest.raises(ConflictError):
        orbit.update_task(parent.id, status=Status.DONE)


def test_task_cannot_become_its_own_ancestor(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    parent = orbit.add_task("a", "Parent")
    child = orbit.add_task("a", "Child", parent_id=parent.id)
    with pytest.raises(ValidationError, match="parent"):
        orbit.update_task(parent.id, parent_id=child.id)
    with pytest.raises(ValidationError, match="parent"):
        orbit.update_task(parent.id, parent_id=parent.id)


def test_rename_project_slug(orbit: Orbit) -> None:
    orbit.add_project("old", name="X")
    orbit.update_project("old", slug="new")
    assert orbit.get_project("new").name == "X"


# --- deletes ----------------------------------------------------------------


def test_delete_task_with_subtasks_needs_force(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    parent = orbit.add_task("a", "Parent")
    child = orbit.add_task("a", "Child", parent_id=parent.id)
    with pytest.raises(ConflictError):
        orbit.delete_task(parent.id)
    orbit.delete_task(parent.id, force=True)
    for task_id in (parent.id, child.id):
        with pytest.raises(NotFoundError):
            orbit.get_task(task_id)


def test_delete_milestone_with_tasks_needs_force(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    t = orbit.add_task("a", "T", milestone_id=m.id)
    with pytest.raises(ConflictError):
        orbit.delete_milestone(m.id)
    orbit.delete_milestone(m.id, force=True)
    with pytest.raises(NotFoundError):
        orbit.get_task(t.id)


# --- tree -------------------------------------------------------------------


def test_tree_nests_milestones_tasks_and_subtasks(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    parent = orbit.add_task("a", "Parent", milestone_id=m.id, status=Status.DONE)
    orbit.add_task("a", "Child", parent_id=parent.id, status=Status.DONE)
    orbit.add_task("a", "Loose")

    [node] = orbit.tree("a")
    assert node.project.slug == "a"
    [mnode] = node.milestones
    assert mnode.milestone.id == m.id
    assert mnode.progress == 1.0
    [pnode] = mnode.tasks
    assert [c.task.title for c in pnode.children] == ["Child"]
    assert [t.task.title for t in node.tasks] == ["Loose"]
    assert node.progress == 1.0


def test_tree_marks_overdue_items(orbit: Orbit) -> None:
    orbit.add_project("a", name="A", due_date=TODAY - timedelta(days=1))
    [node] = orbit.tree()
    assert node.overdue


def test_tree_without_slug_skips_archived_projects(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_project("b", name="B")
    orbit.archive_project("b")
    assert [n.project.slug for n in orbit.tree()] == ["a"]


def test_force_delete_milestone_with_nested_tasks_logs_each_once(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    parent = orbit.add_task("a", "Parent", milestone_id=m.id)
    child = orbit.add_task("a", "Child", parent_id=parent.id)
    orbit.delete_milestone(m.id, force=True)
    deleted = sorted(e.entity_id for e in orbit.events(entity="task") if e.action == "delete")
    assert deleted == sorted([parent.id, child.id])


def test_unarchive_restores_project(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.archive_project("a")
    project = orbit.unarchive_project("a")
    assert project.archived_at is None
    assert [p.slug for p in orbit.list_projects()] == ["a"]
    [_, archive, unarchive] = orbit.events()
    assert (unarchive.field, unarchive.new_value) == ("archived_at", None)
    assert unarchive.old_value == archive.new_value
