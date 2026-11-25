"""Imported Claude sessions: facts from the journals, matched to projects by slug."""

from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from orbit.domain.errors import NotFoundError
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionRecord
from tests.conftest import NOW

RECORD = SessionRecord(
    external_id="a1b2c3d4-0000-4000-8000-000000000001",
    project="orbit",
    started_at=NOW - timedelta(hours=2),
    ended_at=NOW,
    title="Stage 2",
    prompts=11,
    files=24,
    commits=6,
    folder="d:\\Projects\\orbit",
)
LATER = replace(
    RECORD,
    external_id="b2c3d4e5-0000-4000-8000-000000000002",
    started_at=NOW + timedelta(hours=1),
    ended_at=NOW + timedelta(hours=2),
    title="Stage 3",
)


@pytest.fixture(autouse=True)
def _project(orbit: Orbit) -> None:
    orbit.add_project("orbit", name="Orbit", repo_path="D:\\Projects\\orbit")


def test_import_adds_sessions_to_their_project(orbit: Orbit) -> None:
    result = orbit.import_sessions([RECORD])
    assert (result.added, result.updated, result.unchanged) == (1, 0, 0)
    [row] = orbit.sessions("orbit")
    assert row.title == "Stage 2"
    assert (row.prompts, row.files, row.commits) == (11, 24, 6)
    assert row.started_at == RECORD.started_at
    assert row.project_id == orbit.get_project("orbit").id


def test_second_import_changes_nothing(orbit: Orbit, session: Session) -> None:
    orbit.import_sessions([RECORD])
    session.commit()
    result = orbit.import_sessions([RECORD])
    assert (result.added, result.updated, result.unchanged) == (0, 0, 1)
    assert not session.dirty and not session.new


def test_resumed_session_is_updated_in_place(orbit: Orbit) -> None:
    orbit.import_sessions([RECORD])
    result = orbit.import_sessions([replace(RECORD, ended_at=NOW + timedelta(hours=3), prompts=20)])
    assert (result.added, result.updated) == (0, 1)
    [row] = orbit.sessions("orbit")
    assert row.prompts == 20


def test_unknown_project_is_reported_not_created(orbit: Orbit) -> None:
    result = orbit.import_sessions([replace(RECORD, project="garden")])
    assert result.unknown_projects == {"garden": 1}
    assert orbit.sessions() == []
    assert [p.slug for p in orbit.list_projects()] == ["orbit"]


def test_archived_project_still_receives_sessions(orbit: Orbit) -> None:
    orbit.archive_project("orbit")
    assert orbit.import_sessions([RECORD]).added == 1


def test_newest_first_and_limited(orbit: Orbit) -> None:
    orbit.import_sessions([RECORD, LATER])
    assert [s.title for s in orbit.sessions("orbit")] == ["Stage 3", "Stage 2"]
    assert [s.title for s in orbit.sessions(limit=1)] == ["Stage 3"]


def test_other_project_has_its_own_sessions(orbit: Orbit) -> None:
    orbit.add_project("other", name="Other")
    orbit.import_sessions([RECORD, replace(LATER, project="other")])
    assert [s.title for s in orbit.sessions("other")] == ["Stage 3"]


def test_unknown_project_in_a_question_is_an_error(orbit: Orbit) -> None:
    with pytest.raises(NotFoundError):
        orbit.sessions("nope")


def test_long_title_is_cut_instead_of_failing(orbit: Orbit) -> None:
    orbit.import_sessions([replace(RECORD, title="x" * 1000)])
    [row] = orbit.sessions("orbit")
    assert len(row.title) == 300
    assert orbit.import_sessions([replace(RECORD, title="x" * 1000)]).unchanged == 1


def test_import_writes_no_events(orbit: Orbit) -> None:
    """Sessions are facts about the past, not edits of the plan."""
    before = len(orbit.events())
    orbit.import_sessions([RECORD])
    assert len(orbit.events()) == before
