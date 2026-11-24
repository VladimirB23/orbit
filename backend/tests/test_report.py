from datetime import timedelta

from orbit.domain.enums import Status
from orbit.domain.service import Orbit
from tests.conftest import TODAY


def test_status_report_groups_items(orbit: Orbit) -> None:
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    late = orbit.add_task("a", "Late", due_date=TODAY - timedelta(days=2))
    soon = orbit.add_milestone("a", "Soon", due_date=TODAY + timedelta(days=3))
    orbit.add_task("a", "Far", due_date=TODAY + timedelta(days=30))
    stuck = orbit.add_task("a", "Stuck", status=Status.BLOCKED)
    orbit.add_task("a", "Closed late", status=Status.DONE, due_date=TODAY - timedelta(days=5))

    report = orbit.status_report(days=7)

    assert [(i.entity, i.title) for i in report.in_progress] == [("project", "A")]
    assert [(i.entity, i.id) for i in report.blocked] == [("task", stuck.id)]
    assert [(i.entity, i.id) for i in report.overdue] == [("task", late.id)]
    assert [(i.entity, i.id) for i in report.upcoming] == [("milestone", soon.id)]
    assert report.overdue[0].project == "a"


def test_status_report_skips_archived_projects(orbit: Orbit) -> None:
    orbit.add_project("a", name="A", status=Status.IN_PROGRESS)
    orbit.add_task("a", "Late", due_date=TODAY - timedelta(days=2))
    orbit.archive_project("a")
    report = orbit.status_report()
    assert report.in_progress == report.overdue == []


def test_upcoming_is_sorted_by_due_date(orbit: Orbit) -> None:
    orbit.add_project("a", name="A")
    orbit.add_task("a", "Later", due_date=TODAY + timedelta(days=5))
    orbit.add_task("a", "Today", due_date=TODAY)
    assert [i.title for i in orbit.status_report().upcoming] == ["Today", "Later"]
