"""Numbers of the analytics screen. The counting is in sql/*.sql, one commented file per step."""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from functools import cache
from importlib.resources import files
from typing import Any

from sqlalchemy import RowMapping, text

from orbit.domain.enums import Status
from orbit.domain.errors import ValidationError
from orbit.domain.rules import Attention, attention, attention_share, expected_shares
from orbit.domain.service import Orbit, ReportItem

VIEWS = (
    "events_in_force",
    "lives",
    "status_changes",
    "task_facts",
    "milestone_facts",
    "activity_facts",
)
DUE_DAYS = 14
DAILY_UP_TO = 14  # days in a period
WEEKLY_UP_TO = 200
LONGEST_DAYS = 3660  # ten years; a typo in the year is not a period
STRIDE = {"day": "+1 day", "week": "+7 days", "month": "+1 month"}

# Below these a chart says what is missing instead of drawing a pattern out of noise.
CYCLE_NEEDED = 10  # tasks with a known start
PLAN_NEEDED = 3  # milestones that had a deadline


# --- what is asked ------------------------------------------------------------


@dataclass(frozen=True)
class Period:
    """Local days, both ends included."""

    start: date
    end: date

    def __post_init__(self) -> None:
        if self.start > self.end:
            raise ValidationError(f"period start {self.start} is after its end {self.end}")
        if self.days > LONGEST_DAYS:
            raise ValidationError(f"period is longer than {LONGEST_DAYS} days")

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def before(self) -> "Period":
        """As long as this one, right before it."""
        return Period(self.start - timedelta(days=self.days), self.start - timedelta(days=1))

    @property
    def step(self) -> str:
        if self.days <= DAILY_UP_TO:
            return "day"
        return "week" if self.days <= WEEKLY_UP_TO else "month"

    @property
    def first_step(self) -> date:
        if self.step == "week":
            return self.start - timedelta(days=self.start.weekday())
        return self.start.replace(day=1) if self.step == "month" else self.start


# --- what is answered ---------------------------------------------------------


@dataclass(frozen=True)
class Measure:
    value: int
    before: int | None  # None: there was no journal of it in the period before


@dataclass
class Totals:
    sessions: Measure
    commits: Measure
    closed: Measure
    prompts: int
    born_closed: int


@dataclass
class FocusRow:
    id: int
    slug: str
    name: str
    status: Status
    priority: int
    archived: bool
    sessions: int
    prompts: int
    commits: int
    closed: int
    sessions_share: float
    commits_share: float
    share: float  # of attention: the mean of both
    expected: float | None  # by priority among projects in progress
    attention: Attention
    last_day: date | None  # of a session, a commit or a change of status
    done: int
    working: int
    stuck: int
    ahead: int


@dataclass
class ActivityRow:
    slug: str
    name: str
    sessions: list[int]
    commits: list[int]


@dataclass
class CycleItem:
    task_id: int
    title: str
    project: str
    started: date
    done: date
    days: int


@dataclass
class Cycle:
    items: list[CycleItem] = field(default_factory=list)
    median: float | None = None
    p85: int | None = None
    needed: int = CYCLE_NEEDED
    known: int = 0
    no_start: int = 0
    born_closed: int = 0


@dataclass
class PlanItem:
    milestone_id: int
    name: str
    project: str
    due: date
    done: date
    days: int  # above zero: late
    moves: int  # of the deadline before closing
    automatic: bool  # nobody chose this deadline


@dataclass
class Plan:
    items: list[PlanItem] = field(default_factory=list)
    needed: int = PLAN_NEEDED
    compared: int = 0
    late: int = 0
    automatic: int = 0
    no_due: int = 0
    set_after: int = 0
    born_closed: int = 0


@dataclass
class Deadline:
    entity: str
    id: int
    project: str
    title: str
    status: Status
    due: date
    days: int  # below zero: overdue


@dataclass
class Analytics:
    today: date
    start: date
    end: date
    step: str
    steps: list[date]
    totals: Totals
    focus: list[FocusRow]
    activity: list[ActivityRow]
    closed: list[int]
    born_closed: list[int]
    cycle: Cycle
    plan: Plan
    deadlines: list[Deadline]


# --- counting -------------------------------------------------------------------


@cache
def load_sql(name: str) -> str:
    return (files("orbit.domain") / "sql" / f"{name}.sql").read_text(encoding="utf-8")


def prepare(orbit: Orbit) -> None:
    """Views for this connection only: nothing is written to the database file.

    Days are local, and only the clock knows the time zone: SQL asks it through local_day().
    """

    def local_day(moment: str | None) -> str | None:
        if moment is None:
            return None
        at = datetime.fromisoformat(moment).replace(tzinfo=UTC)
        return orbit.clock.day_of(at).isoformat()

    connection = orbit.session.connection()
    driver: Any = connection.connection.driver_connection
    driver.create_function("local_day", 1, local_day, deterministic=True)
    for view in VIEWS:
        connection.exec_driver_sql(load_sql(view))


def _rows(orbit: Orbit, name: str, **params: Any) -> list[RowMapping]:
    values = {k: v.isoformat() if isinstance(v, date) else v for k, v in params.items()}
    return list(orbit.session.execute(text(load_sql(name)), values).mappings())


def _day(value: str | None) -> date | None:
    return None if value is None else date.fromisoformat(value)


def all_time(orbit: Orbit) -> Period:
    prepare(orbit)
    today = orbit.clock.today()
    first = _day(orbit.session.scalar(text(load_sql("first_day"))))
    earliest = today - timedelta(days=LONGEST_DAYS - 1)
    return Period(max(min(first or today, today), earliest), today)


def analyze(orbit: Orbit, period: Period, project: str | None = None) -> Analytics:
    project_id = None if project is None else orbit.get_project(project).id
    prepare(orbit)
    scope = {"start": period.start, "end": period.end, "project": project_id}
    steps = _rows(
        orbit,
        "activity",
        **scope,
        unit=period.step,
        first=period.first_step,
        stride=STRIDE[period.step],
    )
    days = sorted({date.fromisoformat(row["step"]) for row in steps})
    series = _Series(days, steps)
    return Analytics(
        today=orbit.clock.today(),
        start=period.start,
        end=period.end,
        step=period.step,
        steps=days,
        totals=_totals(orbit, period, project_id),
        focus=_focus(orbit, scope),
        activity=series.by_project(),
        closed=series.total("closed"),
        born_closed=series.total("born_closed"),
        cycle=_cycle(orbit, scope),
        plan=_plan(orbit, scope),
        deadlines=_deadlines(orbit, project),
    )


def _totals(orbit: Orbit, period: Period, project_id: int | None) -> Totals:
    before = period.before
    rows = {
        row["kind"]: row
        for row in _rows(
            orbit,
            "totals",
            start=period.start,
            end=period.end,
            before_start=before.start,
            before_end=before.end,
            project=project_id,
        )
    }

    def measure(kind: str) -> Measure:
        row = rows[kind]
        first = _day(row["first_day"])
        known = first is not None and first <= before.start
        return Measure(row["now"], row["before"] if known else None)

    return Totals(
        sessions=measure("session"),
        commits=measure("commit"),
        closed=measure("closed"),
        prompts=rows["prompt"]["now"],
        born_closed=rows["born_closed"]["now"],
    )


def _focus(orbit: Orbit, scope: dict[str, Any]) -> list[FocusRow]:
    every = _rows(orbit, "focus", **{**scope, "project": None}, today=orbit.clock.today())
    sessions = every[0]["all_sessions"] if every else 0
    commits = every[0]["all_commits"] if every else 0
    expected = expected_shares(
        {p.slug: p.priority for p in orbit.list_projects() if p.status == Status.IN_PROGRESS},
        with_code={row["slug"] for row in every if row["has_code"]},
        sessions=sessions,
        commits=commits,
    )

    def focus(row: RowMapping) -> FocusRow:
        share = attention_share(row["sessions"], sessions, row["commits"], commits)
        wanted = expected.get(row["slug"])
        return FocusRow(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            status=Status(row["status"]),
            priority=row["priority"],
            archived=bool(row["archived"]),
            sessions=row["sessions"],
            prompts=row["prompts"],
            commits=row["commits"],
            closed=row["closed"],
            sessions_share=row["sessions"] / sessions if sessions else 0.0,
            commits_share=row["commits"] / commits if commits else 0.0,
            share=share,
            expected=wanted,
            attention=attention(share, wanted, sessions + commits),
            last_day=_day(row["last_day"]),
            done=row["done"],
            working=row["working"],
            stuck=row["stuck"],
            ahead=row["ahead"],
        )

    rows = [focus(row) for row in _rows(orbit, "focus", **scope, today=orbit.clock.today())]
    return sorted(rows, key=lambda row: -row.share)


class _Series:
    """Sparse rows of activity.sql -> a number for every step."""

    def __init__(self, steps: list[date], rows: list[RowMapping]) -> None:
        self._index = {step.isoformat(): i for i, step in enumerate(steps)}
        self._rows = [row for row in rows if row["kind"] is not None]

    def total(self, kind: str) -> list[int]:
        line = [0] * len(self._index)
        for row in self._rows:
            if row["kind"] == kind:
                line[self._index[row["step"]]] += row["amount"]
        return line

    def by_project(self) -> list[ActivityRow]:
        result: dict[str, ActivityRow] = {}
        for row in self._rows:
            if row["kind"] not in ("session", "commit"):
                continue
            empty = [0] * len(self._index)
            line = result.setdefault(
                row["slug"], ActivityRow(row["slug"], row["name"], empty, list(empty))
            )
            numbers = line.sessions if row["kind"] == "session" else line.commits
            numbers[self._index[row["step"]]] = row["amount"]
        return sorted(result.values(), key=lambda r: (-sum(r.sessions), -sum(r.commits), r.name))


def _cycle(orbit: Orbit, scope: dict[str, Any]) -> Cycle:
    result = Cycle()
    for row in _rows(orbit, "cycle", **scope):
        if row["cycle_days"] is not None:
            result.items.append(
                CycleItem(
                    task_id=row["id"],
                    title=row["title"],
                    project=row["slug"],
                    started=date.fromisoformat(row["started"]),
                    done=date.fromisoformat(row["done"]),
                    days=row["cycle_days"],
                )
            )
        elif row["born_closed"]:
            result.born_closed += 1
        else:
            result.no_start += 1
    result.known = len(result.items)
    [stats] = _rows(orbit, "cycle_stats", **scope)
    result.median, result.p85 = stats["median"], stats["p85"]
    return result


def _plan(orbit: Orbit, scope: dict[str, Any]) -> Plan:
    result = Plan()
    for row in _rows(orbit, "plan", **scope):
        match row["plan_state"]:
            case "compared":
                result.items.append(
                    PlanItem(
                        milestone_id=row["id"],
                        name=row["name"],
                        project=row["slug"],
                        due=date.fromisoformat(row["plan_due"]),
                        done=date.fromisoformat(row["done"]),
                        days=row["days_late"],
                        moves=row["moves"],
                        automatic=bool(row["automatic"]),
                    )
                )
            case "born_closed":
                result.born_closed += 1
            case "set_after":
                result.set_after += 1
            case _:
                result.no_due += 1
    result.compared = len(result.items)
    result.late = sum(item.days > 0 for item in result.items)
    result.automatic = sum(item.automatic for item in result.items)
    return result


def _deadlines(orbit: Orbit, project: str | None) -> list[Deadline]:
    """About today, whatever the period: a past deadline is still ahead of the one who missed it."""
    report = orbit.status_report(days=DUE_DAYS)

    def deadline(item: ReportItem) -> Deadline:
        assert item.due_date is not None
        return Deadline(
            entity=item.entity,
            id=item.id,
            project=item.project,
            title=item.title,
            status=Status(item.status),
            due=item.due_date,
            days=(item.due_date - report.today).days,
        )

    items = [deadline(item) for item in [*report.overdue, *report.upcoming]]
    return [item for item in items if project in (None, item.project)]
