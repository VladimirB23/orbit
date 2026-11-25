"""A project that is only talked about: no folder yet, sessions of another project are about it.

When the folder appears it becomes an ordinary project with everything it already had.
"""

from dataclasses import replace
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from orbit.domain import analytics as a
from orbit.domain.enums import Action, Actor, Status
from orbit.domain.errors import NotFoundError, ValidationError
from orbit.domain.rules import is_future
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionRecord
from tests.conftest import NOW, TODAY, FakeClock

HQ = SessionRecord(
    external_id="9c0c1111-0000-4000-8000-000000000003",
    project="hq",
    started_at=NOW - timedelta(days=3),
    ended_at=NOW - timedelta(days=3),
    title="Goals of the bot",
    prompts=6,
    files=0,
    commits=0,
    folder="C:\\Users\\me",
)
OWN = replace(
    HQ,
    external_id="c3d4e5f6-0000-4000-8000-000000000004",
    project="bot",
    started_at=NOW - timedelta(days=1),
    title="First day in the folder",
    folder="d:\\Projects\\bot\\backend",
)


@pytest.fixture(autouse=True)
def _projects(orbit: Orbit) -> None:
    orbit.add_project("hq", name="HQ", status=Status.IN_PROGRESS, repo_path="C:\\Users\\me")
    orbit.add_project("bot", name="Bot")


def future(orbit: Orbit) -> list[str]:
    return [node.project.slug for node in orbit.tree() if node.future]


# --- the rule ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("folder", "status", "expected"),
    [
        (None, Status.BACKLOG, True),
        (None, Status.IN_PROGRESS, True),  # being talked over, still nowhere to work
        (None, Status.PAUSED, True),
        (None, Status.DONE, False),  # over: there is nothing ahead
        (None, Status.CANCELED, False),
        ("D:\\Projects\\bot", Status.BACKLOG, False),
    ],
)
def test_no_folder_and_not_closed(folder: str | None, status: Status, expected: bool) -> None:
    assert is_future(folder, status) is expected


def test_the_tree_says_which_projects_are_future(orbit: Orbit) -> None:
    assert future(orbit) == ["bot"]


@pytest.mark.parametrize("status", list(Status))
def test_sql_knows_the_same_rule(orbit: Orbit, status: Status) -> None:
    orbit.update_project("bot", status=status)
    a.prepare(orbit)
    rows = orbit.session.execute(text("SELECT project_id FROM future_projects")).scalars()
    expected = [p.id for p in orbit.list_projects() if is_future(p.repo_path, Status(p.status))]
    assert list(rows) == expected


# --- a folder appears ----------------------------------------------------------


def test_with_a_folder_it_is_the_same_project(orbit: Orbit) -> None:
    task = orbit.add_task("bot", "Pick a name")
    before = orbit.get_project("bot").id
    orbit.update_project("bot", repo_path="D:\\Projects\\bot")
    assert future(orbit) == []
    assert orbit.get_project("bot").id == before
    assert [t.id for t in orbit.list_tasks("bot")] == [task.id]


def test_the_first_session_in_its_own_folder_tells_where_it_is(orbit: Orbit) -> None:
    result = orbit.import_sessions([OWN])
    assert result.started == ["bot"]
    assert orbit.get_project("bot").repo_path == "D:\\Projects\\bot"
    assert future(orbit) == []


def test_that_day_stays_in_the_journal(orbit: Orbit) -> None:
    orbit.import_sessions([OWN])
    last = orbit.events()[-1]
    assert (last.action, last.field, last.old_value) == (Action.UPDATE, "repo_path", None)
    assert last.new_value == "D:\\Projects\\bot"


@pytest.mark.parametrize(
    "folder",
    [
        None,
        "C:\\Users\\me",  # some other place
        "\\\\server\\share\\bot",  # a network path may send the password hash away
        "//server/share/bot",
        "bot",  # not a whole path
    ],
)
def test_other_folders_prove_nothing(orbit: Orbit, folder: str | None) -> None:
    assert orbit.import_sessions([replace(OWN, folder=folder)]).started == []
    assert future(orbit) == ["bot"]


def test_a_folder_set_by_hand_is_kept(orbit: Orbit) -> None:
    orbit.update_project("bot", repo_path="E:\\work\\bot")
    assert orbit.import_sessions([OWN]).started == []
    assert orbit.get_project("bot").repo_path == "E:\\work\\bot"


def test_a_folder_cleared_by_hand_does_not_come_back(orbit: Orbit) -> None:
    orbit.import_sessions([OWN])
    orbit.update_project("bot", repo_path=None)
    later = replace(OWN, external_id="b2c3d4e5-0000-4000-8000-000000000002")
    assert orbit.import_sessions([OWN, later]).started == []
    assert future(orbit) == ["bot"]


# --- what a session is about ------------------------------------------------------


def test_a_session_about_another_project_is_seen_in_both(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    orbit.set_session_topic(HQ.external_id, "bot")
    assert [s.title for s in orbit.sessions("bot")] == ["Goals of the bot"]
    assert [s.title for s in orbit.sessions("hq")] == ["Goals of the bot"]
    [row] = orbit.sessions()
    assert row.project_id == orbit.get_project("hq").id
    assert row.topic_id == orbit.get_project("bot").id


def test_the_next_import_keeps_it(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    orbit.set_session_topic(HQ.external_id, "bot")
    orbit.import_sessions([replace(HQ, prompts=20)])
    [row] = orbit.sessions("bot")
    assert row.prompts == 20


def test_it_can_be_taken_back(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    orbit.set_session_topic(HQ.external_id, "bot")
    orbit.set_session_topic(HQ.external_id, None)
    assert orbit.sessions("bot") == []


def test_about_its_own_project_is_about_nothing_else(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    assert orbit.set_session_topic(HQ.external_id, "hq").topic_id is None


def test_the_beginning_of_the_id_is_enough(orbit: Orbit) -> None:
    orbit.import_sessions([HQ, OWN])
    assert orbit.set_session_topic("9c0c", "bot").external_id == HQ.external_id


@pytest.mark.parametrize("wrong", ["", "9c0", "%", "ffff", "____"])
def test_no_such_session(orbit: Orbit, wrong: str) -> None:
    orbit.import_sessions([HQ])
    with pytest.raises((NotFoundError, ValidationError)):
        orbit.set_session_topic(wrong, "bot")


def test_two_sessions_with_one_beginning(orbit: Orbit) -> None:
    orbit.import_sessions([HQ, replace(HQ, external_id="9c0c0000-0000-4000-8000-000000000000")])
    with pytest.raises(ValidationError, match="2 sessions"):
        orbit.set_session_topic("9c0c", "bot")


def test_topic_must_be_a_project(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    with pytest.raises(NotFoundError):
        orbit.set_session_topic(HQ.external_id, "nope")


# --- analytics ------------------------------------------------------------------


def focus(orbit: Orbit, start: date = TODAY - timedelta(days=29)) -> dict[str, a.FocusRow]:
    return {row.slug: row for row in a.analyze(orbit, a.Period(start, TODAY)).focus}


def test_a_session_counts_once_for_what_it_is_about(orbit: Orbit) -> None:
    orbit.import_sessions([HQ])
    orbit.set_session_topic(HQ.external_id, "bot")
    rows = focus(orbit)
    assert (rows["bot"].sessions, rows["hq"].sessions) == (1, 0)
    assert rows["bot"].prompts == 6


def test_nothing_is_expected_of_a_future_project(orbit: Orbit) -> None:
    orbit.update_project("bot", status=Status.IN_PROGRESS, priority=4)
    rows = focus(orbit)
    assert rows["bot"].future and rows["bot"].expected is None
    assert not rows["hq"].future


def test_a_future_project_takes_no_part_of_the_others(orbit: Orbit) -> None:
    orbit.update_project("bot", status=Status.IN_PROGRESS, priority=4)
    orbit.import_sessions([HQ])
    assert focus(orbit)["hq"].expected == 1.0


def test_its_past_sessions_come_along_when_it_begins(orbit: Orbit, clock: FakeClock) -> None:
    orbit.import_sessions([HQ])
    orbit.set_session_topic(HQ.external_id, "bot")
    orbit.update_project("bot", status=Status.IN_PROGRESS)
    orbit.import_sessions([HQ, OWN])
    row = focus(orbit)["bot"]
    assert not row.future
    assert row.sessions == 2
    assert row.expected is not None and row.expected > 0


def test_import_by_the_system_is_signed_by_it(session: Session, clock: FakeClock) -> None:
    system = Orbit(session, actor=Actor.SYSTEM, clock=clock)
    system.import_sessions([OWN])
    assert system.events()[-1].actor == "system"
