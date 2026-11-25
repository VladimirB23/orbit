import json
from datetime import date, timedelta

from sqlalchemy.orm import Session

from orbit.domain.enums import Actor, Status
from orbit.domain.service import Orbit
from tests.conftest import NOW, FakeClock


def test_create_writes_one_event_with_snapshot(orbit: Orbit) -> None:
    p = orbit.add_project("orbit", name="Orbit", due_date=date(2026, 12, 20))
    [e] = orbit.events()
    assert (e.actor, e.entity, e.entity_id, e.action, e.field) == (
        "owner",
        "project",
        p.id,
        "create",
        None,
    )
    assert e.at == NOW
    snapshot = json.loads(e.new_value or "")
    assert snapshot["slug"] == "orbit"
    assert snapshot["due_date"] == "2026-12-20"
    assert e.old_value is None


def test_update_writes_one_event_per_changed_field(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T", due_date=date(2026, 12, 1))
    orbit.update_task(t.id, status=Status.IN_PROGRESS, due_date=date(2026, 12, 5), title="T")
    updates = [e for e in orbit.events() if e.action == "update"]
    assert {(e.field, e.old_value, e.new_value) for e in updates} == {
        ("status", "backlog", "in_progress"),
        ("due_date", "2026-12-01", "2026-12-05"),
    }


def test_derived_fields_are_not_logged(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T")
    orbit.update_task(t.id, status=Status.DONE)
    fields = {e.field for e in orbit.events() if e.action == "update"}
    assert fields == {"status"}


def test_clearing_a_field_logs_null_new_value(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    t = orbit.add_task("a", "T", comment="hi")
    orbit.update_task(t.id, comment=None)
    [e] = [e for e in orbit.events() if e.action == "update"]
    assert (e.field, e.old_value, e.new_value) == ("comment", "hi", None)


def test_archive_is_logged_as_update(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.archive_project("a")
    [e] = [e for e in orbit.events() if e.action == "update"]
    assert e.field == "archived_at"
    assert e.old_value is None


def test_delete_logs_snapshot_for_each_removed_row(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    m = orbit.add_milestone("a", "M")
    t = orbit.add_task("a", "T", milestone_id=m.id)
    orbit.delete_milestone(m.id, force=True)
    deletes = {(e.entity, e.entity_id): e for e in orbit.events() if e.action == "delete"}
    assert set(deletes) == {("milestone", m.id), ("task", t.id)}
    assert json.loads(deletes[("task", t.id)].old_value or "")["title"] == "T"


def test_actor_is_taken_from_the_service(session: Session, clock: FakeClock) -> None:
    claude = Orbit(session, actor=Actor.CLAUDE, clock=clock)
    claude.add_project("a", name="A")
    assert [e.actor for e in claude.events()] == ["claude"]


def test_events_can_be_filtered_by_time_and_entity(orbit: Orbit, clock: FakeClock) -> None:
    p = orbit.add_project("a", name="A")
    clock.advance(days=10)
    t = orbit.add_task("a", "T")
    recent = orbit.events(since=NOW + timedelta(days=1))
    assert [(e.entity, e.entity_id) for e in recent] == [("task", t.id)]
    assert [e.entity_id for e in orbit.events(entity="project", entity_id=p.id)] == [p.id]
