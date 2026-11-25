"""Pure business rules: no database, no clock, easy to test."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum

from orbit.domain.enums import (
    CLOSED_STATUSES,
    COMMITTED_STATUSES,
    Actor,
    Entity,
    Priority,
    Status,
)
from orbit.domain.errors import ValidationError


def task_progress(statuses: Iterable[Status]) -> float | None:
    """done / (all - canceled); None when nothing is countable."""
    counted = [s for s in statuses if s is not Status.CANCELED]
    if not counted:
        return None
    return sum(s is Status.DONE for s in counted) / len(counted)


def _own_status_progress(status: Status) -> float:
    return 1.0 if status is Status.DONE else 0.0


def milestone_progress(status: Status, task_statuses: Sequence[Status]) -> float:
    """By tasks; a milestone without countable tasks goes by its own status."""
    progress = task_progress(task_statuses)
    return _own_status_progress(status) if progress is None else progress


def project_progress(
    status: Status,
    milestones: Sequence[tuple[Status, float]],
    task_statuses: Sequence[Status],
) -> float:
    """Mean of non-canceled milestones; else by tasks; else by own status."""
    active = [progress for m_status, progress in milestones if m_status is not Status.CANCELED]
    if active:
        return sum(active) / len(active)
    progress = task_progress(task_statuses)
    return _own_status_progress(status) if progress is None else progress


def is_overdue(due_date: date | None, status: Status, today: date) -> bool:
    return due_date is not None and due_date < today and status not in CLOSED_STATUSES


def is_upcoming(due_date: date | None, status: Status, today: date, days: int) -> bool:
    """Open and due between today and the horizon, both ends included."""
    return (
        due_date is not None
        and today <= due_date <= today + timedelta(days=days)
        and status not in CLOSED_STATUSES
    )


def is_future(folder: str | None, status: Status) -> bool:
    """A project that is only talked about: there is no folder to work in yet."""
    return folder is None and status not in CLOSED_STATUSES


@dataclass(frozen=True)
class Actual:
    """When work really began and ended; None while unknown or not yet."""

    start: date | None
    end: date | None


def actual_span(history: Sequence[tuple[Status, date]], status: Status) -> Actual:
    """From the statuses a row has entered, oldest first.

    The beginning is the first day in progress. A row closed without it has only an end:
    the day it was created says nothing about work.
    """
    start = next((day for entered, day in history if entered is Status.IN_PROGRESS), None)
    end = None
    if status in CLOSED_STATUSES:
        end = next((day for entered, day in reversed(history) if entered is status), None)
    return Actual(start, end)


def earliest_sign(actual: Actual, status: Status) -> date | None:
    """The first day that proves work on a row: for the rows above it."""
    if actual.start is not None:
        return actual.start
    return actual.end if status is Status.DONE else None


def with_children(own: Actual, signs: Iterable[date | None]) -> Actual:
    """A row began when anything inside it began, but not after it was closed."""
    days = [day for day in signs if day is not None and (own.end is None or day <= own.end)]
    if own.start is not None:
        days.append(own.start)
    return Actual(min(days, default=None), own.end)


def canceled_out(actions: Sequence[tuple[str, str | None]]) -> set[str]:
    """Actions that are not in force: undone ones together with their undoing.

    Newest first, each with the action it takes back. A redo takes back an undo.
    """
    dead: set[str] = set()
    for action, undoes in actions:
        if undoes is not None and action not in dead:
            dead |= {action, undoes}
    return dead


def next_done_at(
    old: Status, new: Status, current: datetime | None, now: datetime
) -> datetime | None:
    """done_at is set on entering done, kept while done, cleared on leaving."""
    if new is not Status.DONE:
        return None
    return current if old is Status.DONE and current is not None else now


TASK_DAYS = {
    Priority.URGENT: 1,
    Priority.HIGH: 3,
    Priority.MEDIUM: 7,
    Priority.NONE: 7,
    Priority.LOW: 14,
}
MILESTONE_DAYS = 14
PROJECT_DAYS = 30


def default_due(
    entity: Entity,
    priority: Priority,
    start: date | None,
    today: date,
    limits: Iterable[date | None],
) -> date:
    """A deadline nobody had to think of; not later than what the thing is a part of."""
    days = {Entity.PROJECT: PROJECT_DAYS, Entity.MILESTONE: MILESTONE_DAYS}.get(
        entity, TASK_DAYS[priority]
    )
    begin = max(today, start or today)
    due = begin + timedelta(days=days)
    return min([due, *(limit for limit in limits if limit is not None and limit >= begin)])


def is_promise(old: Status | None, new: Status) -> bool:
    """Whether a row has just become planned or running, out of an idea or a pause."""
    return new in COMMITTED_STATUSES and old not in COMMITTED_STATUSES | {Status.BLOCKED}


class Attention(StrEnum):
    """What a project gets of sessions and commits against what its priority asks for."""

    LOW = "low"
    FAIR = "fair"
    HIGH = "high"
    UNKNOWN = "unknown"


FACTS_NEEDED = 10  # sessions and commits together; fewer are not a pattern


def attention_share(sessions: int, all_sessions: int, commits: int, all_commits: int) -> float:
    """Mean of the part of sessions and the part of commits; a kind nobody has is left out."""
    parts = [
        part / whole
        for part, whole in ((sessions, all_sessions), (commits, all_commits))
        if whole > 0
    ]
    return sum(parts) / len(parts) if parts else 0.0


def attention(share: float, expected: float | None, facts: int) -> Attention:
    if expected is None or facts < FACTS_NEEDED:
        return Attention.UNKNOWN
    if share < expected * 0.5:
        # Less than one session or commit was expected: its absence says nothing.
        return Attention.LOW if expected * facts >= 1 else Attention.UNKNOWN
    return Attention.HIGH if share >= expected * 1.5 else Attention.FAIR


def parse_status(value: str) -> Status:
    normalized = value.strip().lower().replace("-", "_")
    try:
        return Status(normalized)
    except ValueError:
        allowed = ", ".join(s.value for s in Status)
        raise ValidationError(f"unknown status '{value}', allowed: {allowed}") from None


def parse_priority(value: int | str) -> Priority:
    if isinstance(value, str):
        text = value.strip().lower()
        if text.lstrip("-").isdigit():
            value = int(text)
        else:
            try:
                return Priority[text.upper()]
            except KeyError:
                pass
    if isinstance(value, int) and value in Priority._value2member_map_:
        return Priority(value)
    names = ", ".join(f"{p.value}={p.name.lower()}" for p in Priority)
    raise ValidationError(f"unknown priority '{value}', allowed: {names}")


def actor_from_env(environ: Mapping[str, str]) -> Actor:
    """ORBIT_ACTOR names who makes the change; unset means Vladimir at the terminal."""
    raw = environ.get("ORBIT_ACTOR", "").strip().lower()
    if not raw:
        return Actor.VLADIMIR
    try:
        return Actor(raw)
    except ValueError:
        allowed = ", ".join(a.value for a in Actor)
        raise ValidationError(f"ORBIT_ACTOR='{raw}' is not one of: {allowed}") from None
