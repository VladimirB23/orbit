from datetime import UTC, date, datetime, timedelta

import pytest

from orbit.domain.enums import Actor, Priority, Status
from orbit.domain.errors import ValidationError
from orbit.domain.rules import (
    actor_from_env,
    is_overdue,
    milestone_progress,
    next_done_at,
    parse_priority,
    parse_status,
    project_progress,
    task_progress,
)

S = Status
TODAY = date(2026, 11, 24)
NOW = datetime(2026, 11, 24, 10, 0, tzinfo=UTC)


# --- progress ---------------------------------------------------------------


def test_task_progress_is_done_over_all_minus_canceled() -> None:
    assert task_progress([S.DONE, S.DONE, S.IN_PROGRESS, S.CANCELED]) == pytest.approx(2 / 3)


def test_task_progress_is_none_without_countable_tasks() -> None:
    assert task_progress([]) is None
    assert task_progress([S.CANCELED, S.CANCELED]) is None


def test_milestone_progress_comes_from_tasks_when_present() -> None:
    assert milestone_progress(S.PLANNED, [S.DONE, S.BACKLOG]) == 0.5


def test_milestone_without_tasks_uses_own_status() -> None:
    assert milestone_progress(S.DONE, []) == 1.0
    assert milestone_progress(S.IN_PROGRESS, []) == 0.0


def test_milestone_with_only_canceled_tasks_uses_own_status() -> None:
    assert milestone_progress(S.DONE, [S.CANCELED]) == 1.0


def test_project_progress_is_mean_of_non_canceled_milestones() -> None:
    milestones = [(S.DONE, 1.0), (S.PLANNED, 0.0), (S.CANCELED, 0.0)]
    assert project_progress(S.IN_PROGRESS, milestones, []) == 0.5


def test_project_without_milestones_uses_tasks() -> None:
    assert project_progress(S.IN_PROGRESS, [], [S.DONE, S.BACKLOG, S.BACKLOG, S.DONE]) == 0.5


def test_project_without_milestones_and_tasks_uses_own_status() -> None:
    assert project_progress(S.DONE, [], []) == 1.0
    assert project_progress(S.PLANNED, [(S.CANCELED, 0.0)], []) == 0.0


# --- overdue ----------------------------------------------------------------


def test_open_item_with_past_due_date_is_overdue() -> None:
    assert is_overdue(TODAY - timedelta(days=1), S.IN_PROGRESS, TODAY)


def test_item_due_today_is_not_overdue() -> None:
    assert not is_overdue(TODAY, S.IN_PROGRESS, TODAY)


def test_item_without_due_date_is_not_overdue() -> None:
    assert not is_overdue(None, S.BLOCKED, TODAY)


@pytest.mark.parametrize("status", [S.DONE, S.CANCELED])
def test_closed_item_is_never_overdue(status: Status) -> None:
    assert not is_overdue(TODAY - timedelta(days=30), status, TODAY)


# --- done_at ----------------------------------------------------------------


def test_done_at_is_set_when_entering_done() -> None:
    assert next_done_at(S.IN_PROGRESS, S.DONE, None, NOW) == NOW


def test_done_at_is_kept_while_staying_done() -> None:
    earlier = NOW - timedelta(days=3)
    assert next_done_at(S.DONE, S.DONE, earlier, NOW) == earlier


def test_done_at_is_cleared_when_leaving_done() -> None:
    assert next_done_at(S.DONE, S.IN_PROGRESS, NOW, NOW) is None


# --- parsing ----------------------------------------------------------------


def test_parse_status_accepts_values_and_dashes() -> None:
    assert parse_status("in_progress") is S.IN_PROGRESS
    assert parse_status("In-Progress") is S.IN_PROGRESS


def test_parse_status_rejects_unknown_value_and_lists_allowed() -> None:
    with pytest.raises(ValidationError, match="backlog"):
        parse_status("wip")


def test_parse_priority_accepts_numbers_and_names() -> None:
    assert parse_priority(3) is Priority.HIGH
    assert parse_priority("urgent") is Priority.URGENT
    assert parse_priority("2") is Priority.MEDIUM


@pytest.mark.parametrize("value", [5, -1, "huge"])
def test_parse_priority_rejects_out_of_range(value: int | str) -> None:
    with pytest.raises(ValidationError):
        parse_priority(value)


# --- actor ------------------------------------------------------------------


def test_actor_defaults_to_the_owner() -> None:
    assert actor_from_env({}) is Actor.OWNER
    assert actor_from_env({"ORBIT_ACTOR": ""}) is Actor.OWNER


def test_actor_is_read_from_orbit_actor() -> None:
    assert actor_from_env({"ORBIT_ACTOR": " Claude "}) is Actor.CLAUDE


def test_unknown_actor_is_rejected() -> None:
    with pytest.raises(ValidationError, match="ORBIT_ACTOR"):
        actor_from_env({"ORBIT_ACTOR": "bob"})
