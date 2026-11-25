"""Numbers of the analytics screen. Every rule that keeps a chart honest has a test here."""

from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from orbit.domain import analytics as a
from orbit.domain.commits import CommitRecord
from orbit.domain.enums import Actor, Status
from orbit.domain.errors import NotFoundError, ValidationError
from orbit.domain.rules import (
    Attention,
    attention,
    attention_share,
    canceled_out,
)
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionRecord
from orbit.domain.undo import redo, undo
from orbit.seed import seed_demo
from tests.conftest import NOW, TODAY, FakeClock

DONE, WORK, PLANNED, BACKLOG = Status.DONE, Status.IN_PROGRESS, Status.PLANNED, Status.BACKLOG


def d(days: int) -> date:
    return TODAY + timedelta(days=days)


def whole(orbit: Orbit, project: str | None = None, days: int = 90) -> a.Analytics:
    return a.analyze(orbit, a.Period(d(1 - days), TODAY), project)


class Story:
    """Short words for tests: day by day, newest last."""

    def __init__(self, orbit: Orbit, clock: FakeClock) -> None:
        self.orbit, self.clock = orbit, clock
        self.sessions: list[SessionRecord] = []

    def on(self, days: int, hour: int = 10) -> "Story":
        self.clock.current = NOW.replace(hour=hour) + timedelta(days=days)
        self.orbit.batch = uuid4().hex  # another day, another action
        return self

    def project(self, slug: str = "a", **fields: Any) -> None:
        fields.setdefault("status", WORK)
        fields.setdefault("repo_path", f"D:\\Projects\\{slug}")  # without it: a future one
        self.orbit.add_project(slug, name=slug.upper(), **fields)

    def task(self, *path: tuple[int, Status], born: Status = BACKLOG, slug: str = "a") -> int:
        """Born on the day of the first step (or now), then one status after another."""
        if path:
            self.on(path[0][0])
        task = self.orbit.add_task(slug, "T", status=born)
        for day, status in path:
            self.on(day).orbit.update_task(task.id, status=status)
        self.on(0)
        return task.id

    def session(self, days: int, slug: str = "a", prompts: int = 5) -> None:
        start = NOW + timedelta(days=days)
        n = len(self.sessions)
        self.sessions.append(
            SessionRecord(f"id-{n}", slug, start, start, f"S{n}", prompts, 0, 99, None)
        )
        self.orbit.import_sessions(self.sessions)

    def commits(self, slug: str, *days: int) -> None:
        records = [CommitRecord(f"{i}", NOW + timedelta(days=n)) for i, n in enumerate(days)]
        self.orbit.import_commits(slug, records)


@pytest.fixture
def story(orbit: Orbit, clock: FakeClock) -> Story:
    return Story(orbit, clock)


# --- period ------------------------------


def test_period_knows_the_one_before_it() -> None:
    period = a.Period(d(-6), TODAY)
    assert period.days == 7
    assert period.before == a.Period(d(-13), d(-7))


def test_period_must_not_be_turned_around() -> None:
    with pytest.raises(ValidationError, match="after"):
        a.Period(TODAY, d(-1))


@pytest.mark.parametrize(
    ("days", "step"),
    [(7, "day"), (14, "day"), (15, "week"), (30, "week"), (200, "week"), (201, "month")],
)
def test_the_step_follows_the_length(days: int, step: str) -> None:
    assert a.Period(d(1 - days), TODAY).step == step


def test_all_time_begins_with_the_first_fact(story: Story) -> None:
    story.project()
    assert a.all_time(story.orbit) == a.Period(TODAY, TODAY)
    story.session(-40)
    story.commits("a", -50)
    assert a.all_time(story.orbit) == a.Period(d(-50), TODAY)


def test_empty_database_has_numbers_too(orbit: Orbit) -> None:
    result = whole(orbit)
    assert result.totals.sessions == a.Measure(0, None)
    assert result.focus == []
    assert result.cycle.median is None


# --- totals ------------------------------


def test_totals_of_the_period_and_of_the_one_before(story: Story) -> None:
    story.project()
    for day in (0, -1, -6, -7, -8, -20):
        story.session(day, prompts=2)
    story.commits("a", 0, -3, -9)
    story.task((-2, DONE))
    totals = whole(story.orbit, days=7).totals
    assert (totals.sessions.value, totals.prompts) == (3, 6)
    assert (totals.commits.value, totals.closed.value) == (2, 1)
    assert totals.sessions.before == 2


def test_commits_of_journals_are_not_used(story: Story) -> None:
    """The journals say 99 in every session of these tests."""
    story.project()
    story.session(0)
    assert whole(story.orbit).totals.commits.value == 0


def test_before_the_first_fact_there_is_nothing_to_compare_with(story: Story) -> None:
    """Zero known sessions and no journal at all are different things."""
    story.project()
    story.session(-3)
    assert whole(story.orbit, days=7).totals.sessions.before is None
    story.session(-10)  # the journal began in the middle of the period before
    assert whole(story.orbit, days=7).totals.sessions.before is None
    story.session(-13)
    assert whole(story.orbit, days=7).totals.sessions.before == 2


def test_every_measure_has_its_own_beginning(story: Story) -> None:
    story.project()
    story.session(-20)
    story.commits("a", -2)
    totals = whole(story.orbit, days=7).totals
    assert (totals.sessions.before, totals.commits.before, totals.closed.before) == (0, None, None)


def test_days_are_local(story: Story, clock: FakeClock) -> None:
    """23:00 UTC in Moscow is already tomorrow."""
    story.project()
    clock.offset = timedelta(hours=3)
    start = datetime(2026, 11, 23, 23, 0, tzinfo=NOW.tzinfo)
    story.orbit.import_sessions([SessionRecord("x", "a", start, start, "S", 1, 0, 0, None)])
    result = a.analyze(story.orbit, a.Period(TODAY, TODAY))
    assert result.totals.sessions.value == 1


def test_filter_by_project(story: Story) -> None:
    for slug in ("a", "b"):
        story.project(slug)
        story.session(0, slug)
        story.commits(slug, 0)
        story.task((-1, DONE), slug=slug)
    story.session(0, "b")
    result = whole(story.orbit, "b")
    totals = result.totals
    assert (totals.sessions.value, totals.commits.value, totals.closed.value) == (2, 1, 1)
    assert [f.slug for f in result.focus] == ["b"]
    assert {row.slug for row in result.activity} == {"b"}


def test_a_share_is_of_everything_even_under_a_filter(story: Story) -> None:
    """Otherwise any project alone would take 100% of attention."""
    for slug in ("a", "b"):
        story.project(slug)
        story.session(0, slug)
    [only] = whole(story.orbit, "b").focus
    assert only.share == 0.5


# --- focus ------------------------------


def test_focus_goes_from_the_most_attended(story: Story) -> None:
    for slug, days in (("a", [0]), ("b", [0, -1, -2]), ("c", [])):
        story.project(slug)
        for day in days:
            story.session(day, slug)
    focus = whole(story.orbit).focus
    assert [(f.slug, f.sessions, f.share) for f in focus] == [
        ("b", 3, 0.75),
        ("a", 1, 0.25),
        ("c", 0, 0.0),
    ]


def test_last_movement_is_a_session_a_commit_or_a_status(story: Story) -> None:
    for slug in ("s", "c", "t", "n"):
        story.on(-20).project(slug)
    story.task((-3, WORK), slug="t")
    story.session(-5, "s")
    story.commits("c", -4)
    last = {f.slug: f.last_day for f in whole(story.orbit).focus}
    # Writing a project down is not work on it.
    assert last == {"s": d(-5), "c": d(-4), "t": d(-3), "n": None}


def test_edits_of_the_plan_are_not_movement(story: Story) -> None:
    """Dates set for ten projects in one evening must not hide that they stand still."""
    story.on(-9).project()
    story.on(-1).orbit.update_project("a", due_date=d(5), summary="x", priority=3)
    story.orbit.add_task("a", "T")
    story.on(0)
    [row] = whole(story.orbit).focus
    assert row.last_day is None


def test_movement_is_known_beyond_the_period(story: Story) -> None:
    story.project()
    story.session(-40)
    [row] = whole(story.orbit, days=7).focus
    assert (row.sessions, row.last_day) == (0, d(-40))


def test_a_commit_with_a_date_in_the_future_is_not_movement_yet(story: Story) -> None:
    story.project()
    story.commits("a", 3)
    [row] = whole(story.orbit).focus
    assert row.last_day is None


def test_an_archived_project_is_seen_only_with_its_work_in_the_period(story: Story) -> None:
    for slug in ("old", "quiet"):
        story.project(slug, status=DONE)
        story.orbit.archive_project(slug)
    story.session(-2, "old")
    assert [f.slug for f in whole(story.orbit).focus] == ["old"]


def test_counts_of_tasks_by_status(story: Story) -> None:
    story.project()
    for status in (BACKLOG, PLANNED, WORK, Status.PAUSED, Status.BLOCKED, DONE, Status.CANCELED):
        story.orbit.add_task("a", "T", status=status)
    [row] = whole(story.orbit).focus
    assert (row.done, row.working, row.stuck, row.ahead) == (1, 1, 2, 2)


# --- attention ------------------------------


def test_attention_is_the_mean_of_both_shares() -> None:
    """Few long sessions with many commits are attention too, and so is talk without commits."""
    assert attention_share(1, 10, 3, 10) == pytest.approx((0.1 + 0.3) / 2)
    assert attention_share(1, 10, 0, 0) == 0.1  # nobody commits: sessions alone
    assert attention_share(0, 0, 3, 10) == 0.3
    assert attention_share(0, 0, 0, 0) == 0.0


def expected(story: Story) -> dict[str, float | None]:
    return {
        f.slug: None if f.expected is None else round(f.expected, 4)
        for f in whole(story.orbit).focus
    }


def test_expected_share_follows_priority_of_projects_under_way(story: Story) -> None:
    story.project("high", priority=3)
    story.project("low", priority=1)
    story.project("idea", status=BACKLOG, priority=4)
    story.session(0, "high")
    story.session(0, "low")
    assert expected(story) == {"high": 0.75, "low": 0.25, "idea": None}


def test_without_priorities_parts_are_equal(story: Story) -> None:
    story.project("a")
    story.project("b")
    story.session(0, "a")
    assert expected(story) == {"a": 0.5, "b": 0.5}


def test_commits_are_expected_only_where_there_is_code(story: Story) -> None:
    for slug in ("code", "talk"):
        story.project(slug)
        story.session(0, slug)
    story.commits("code", 0)
    assert expected(story) == {"code": 0.75, "talk": 0.25}


def test_nothing_is_expected_of_the_days_before_a_project_began(story: Story) -> None:
    """Happened in a long demo: a project of three weeks looked neglected over three months."""
    story.on(-30).project("old")
    for day in range(-30, -20):
        story.session(day, "old")
    story.on(-2).project("new")
    story.on(0)
    story.session(-2, "new")
    rows = {f.slug: f for f in whole(story.orbit).focus}
    assert rows["new"].expected == pytest.approx(0.5 / 11)
    assert rows["new"].attention is not Attention.LOW


def test_the_time_of_finished_projects_is_not_expected_of_the_running(story: Story) -> None:
    story.on(-30).project("done")
    for day in range(-30, -20):
        story.session(day, "done")
    story.on(-20).orbit.update_project("done", status=DONE)
    story.on(-30).project("slow")
    story.on(0)
    story.session(-1, "slow")
    rows = {f.slug: f for f in whole(story.orbit).focus}
    assert rows["done"].expected is None  # nothing is expected of it any more
    # Ten days were shared by two, one day was its own: (10 / 2 + 1) / 11.
    assert rows["slow"].expected == pytest.approx(6 / 11)


@pytest.mark.parametrize(
    ("share", "expected", "total", "result"),
    [
        (0.1, 0.3, 20, Attention.LOW),
        (0.14, 0.3, 20, Attention.LOW),
        (0.15, 0.3, 20, Attention.FAIR),
        (0.44, 0.3, 20, Attention.FAIR),
        (0.45, 0.3, 20, Attention.HIGH),
        (0.0, 0.3, 9, Attention.UNKNOWN),  # nine facts are not a pattern
        (0.5, None, 20, Attention.UNKNOWN),  # not in progress: nothing is expected
        (0.0, 0.004, 200, Attention.UNKNOWN),  # less than one session or commit was expected
        (0.0, 0.005, 200, Attention.LOW),
    ],
)
def test_attention(share: float, expected: float | None, total: int, result: Attention) -> None:
    assert attention(share, expected, total) is result


def test_focus_says_where_attention_is_missing(story: Story) -> None:
    story.on(-10).project("geo", priority=2)
    story.project("job", priority=3)
    story.project("idea", status=BACKLOG, priority=4)
    story.on(0)
    for day in range(9):
        story.session(-day, "geo")
    story.session(0, "job")
    rows = {f.slug: f for f in whole(story.orbit).focus}
    assert rows["geo"].attention is Attention.HIGH
    assert rows["job"].attention is Attention.LOW
    assert (rows["idea"].expected, rows["idea"].attention) == (None, Attention.UNKNOWN)


def test_commits_count_as_attention(story: Story) -> None:
    """Happened for real: four huge sessions looked like neglect until commits were counted."""
    story.on(-10).project("geo", priority=2)
    story.project("orbit", priority=3)
    story.on(0)
    for day in range(9):
        story.session(-day, "geo")
    story.session(0, "orbit")
    story.commits("orbit", *[-n for n in range(9)])
    story.commits("geo", -1)
    rows = {f.slug: f for f in whole(story.orbit).focus}
    assert rows["orbit"].sessions_share == 0.1
    assert rows["orbit"].commits_share == 0.9
    assert rows["orbit"].share == pytest.approx(0.5)
    assert rows["orbit"].attention is Attention.FAIR


# --- activity by time ------------------------------


def test_activity_has_every_step_even_an_empty_one(story: Story) -> None:
    story.project()
    story.session(0)
    story.session(-6)
    result = whole(story.orbit, days=7)
    assert result.steps == [d(n) for n in range(-6, 1)]
    [row] = result.activity
    assert row.sessions == [1, 0, 0, 0, 0, 0, 1]
    assert row.commits == [0] * 7


def test_weeks_begin_on_monday(story: Story) -> None:
    story.project()  # 2026-11-24 is a Tuesday
    story.session(0)
    story.session(-1)
    story.session(-2)
    result = whole(story.orbit, days=30)
    assert all(step.weekday() == 0 for step in result.steps)
    assert result.steps[-1] == date(2026, 11, 23)
    [row] = result.activity
    assert row.sessions[-2:] == [1, 2]


def test_months(story: Story) -> None:
    story.project()
    story.commits("a", 0, -30, -31, -200)
    result = whole(story.orbit, days=300)
    assert result.step == "month"
    assert all(step.day == 1 for step in result.steps)
    [row] = result.activity
    assert row.commits[-2:] == [2, 1]
    assert sum(row.commits) == 4


def test_a_cut_week_counts_only_days_of_the_period(story: Story) -> None:
    story.project()
    story.session(0)
    story.session(-1)
    period = a.Period(d(-29), d(-1))
    result = a.analyze(story.orbit, period)
    [row] = result.activity
    assert row.sessions[-1] == 1


# --- closed tasks ------------------------------


def test_closed_tasks_by_day_born_closed_apart(story: Story) -> None:
    story.project()
    story.task((-2, WORK), (-1, DONE))
    story.task((-1, DONE))
    story.on(-1).task(born=DONE)
    result = whole(story.orbit, days=7)
    assert result.closed == [0, 0, 0, 0, 0, 2, 0]
    assert (result.totals.closed.value, result.totals.born_closed) == (2, 1)


def test_born_closed_is_by_the_day_it_was_written_down(story: Story) -> None:
    story.project()
    story.on(-3).orbit.add_task("a", "T", status=DONE)
    story.on(0)
    result = whole(story.orbit, days=7)
    assert result.born_closed[-4] == 1
    assert sum(result.closed) == 0


def test_a_reopened_task_is_not_closed(story: Story) -> None:
    story.project()
    story.task((-3, DONE), (-1, WORK))
    assert whole(story.orbit).totals.closed.value == 0


def test_closed_twice_counts_once_on_the_last_day(story: Story) -> None:
    story.project()
    story.task((-3, DONE), (-2, WORK), (-1, DONE))
    result = whole(story.orbit, days=7)
    assert result.closed[-2] == 1
    assert sum(result.closed) == 1


def test_a_born_closed_task_reopened_and_closed_is_real_work(story: Story) -> None:
    story.project()
    story.task((-3, WORK), (-1, DONE), born=DONE)
    totals = whole(story.orbit).totals
    assert (totals.closed.value, totals.born_closed) == (1, 0)


def test_canceled_is_not_closed(story: Story) -> None:
    story.project()
    story.task((-1, Status.CANCELED))
    assert whole(story.orbit).totals.closed.value == 0


def test_work_in_archived_projects_was_still_work(story: Story) -> None:
    story.project()
    story.task((-1, DONE))
    story.orbit.archive_project("a")
    assert whole(story.orbit).totals.closed.value == 1


# --- cycle time ------------------------------


def test_cycle_time_is_from_the_first_in_progress_to_the_last_done(story: Story) -> None:
    story.project()
    story.task((-9, WORK), (-8, Status.PAUSED), (-6, WORK), (-5, DONE))
    [item] = whole(story.orbit).cycle.items
    assert (item.started, item.done, item.days) == (d(-9), d(-5), 4)


def test_born_in_progress_has_a_start(story: Story) -> None:
    story.project()
    story.task((-5, WORK), (-2, DONE), born=WORK)
    assert [i.days for i in whole(story.orbit).cycle.items] == [3]


def test_without_a_start_nothing_is_invented(story: Story) -> None:
    story.project()
    story.task((-1, DONE))
    story.on(-1).orbit.add_task("a", "T", status=DONE)
    story.on(0)
    cycle = whole(story.orbit).cycle
    assert cycle.items == []
    assert (cycle.known, cycle.no_start, cycle.born_closed) == (0, 1, 1)
    assert cycle.median is None


def test_reopened_into_work_is_a_start_too(story: Story) -> None:
    story.project()
    story.task((-3, DONE), (-2, WORK), (-1, DONE))
    assert [i.days for i in whole(story.orbit).cycle.items] == [1]


@pytest.mark.parametrize(
    ("days", "median", "p85"),
    [([1], 1, 1), ([1, 3], 2, 3), ([1, 2, 9], 2, 9), ([0, 1, 2, 3], 1.5, 3)],
)
def test_median_by_window_functions(
    story: Story, days: Sequence[int], median: float, p85: int
) -> None:
    story.project()
    for n in days:
        story.task((-n - 1, WORK), (-1, DONE))
    cycle = whole(story.orbit).cycle
    assert (cycle.median, cycle.p85) == (median, p85)


def test_cycle_time_counts_tasks_closed_in_the_period(story: Story) -> None:
    story.project()
    story.task((-40, WORK), (-30, DONE))
    story.task((-9, WORK), (-1, DONE))
    assert [i.days for i in whole(story.orbit, days=7).cycle.items] == [8]


# --- plan and fact ------------------------------


def milestone(story: Story, due: int | None, closed: int, **more: Any) -> int:
    m = story.on(-30).orbit.add_milestone(
        "a", "M", due_date=None if due is None else d(due), **more
    )
    story.on(closed).orbit.update_milestone(m.id, status=DONE)
    story.on(0)
    return m.id


def test_days_between_the_deadline_and_closing(story: Story) -> None:
    story.project()
    milestone(story, -10, -12)
    milestone(story, -10, -8)
    plan = whole(story.orbit).plan
    assert [(i.due, i.done, i.days) for i in plan.items] == [
        (d(-10), d(-8), 2),
        (d(-10), d(-12), -2),
    ]
    assert (plan.compared, plan.late) == (2, 1)


def test_a_milestone_without_a_deadline_is_counted_apart(story: Story) -> None:
    story.project()
    milestone(story, None, -5)
    plan = whole(story.orbit).plan
    assert (plan.items, plan.no_due) == ([], 1)


def test_a_deadline_set_after_closing_is_not_a_plan(story: Story) -> None:
    story.project()
    m = milestone(story, None, -5)
    story.orbit.update_milestone(m, due_date=d(-5))
    plan = whole(story.orbit).plan
    assert (plan.items, plan.no_due, plan.set_after) == ([], 0, 1)


def test_reopening_for_a_minute_does_not_make_it_a_plan(story: Story) -> None:
    """Happened for real: closed, dated 48 minutes later, reopened and closed again."""
    story.project()
    m = milestone(story, None, -5)
    story.orbit.update_milestone(m, due_date=d(0))
    story.orbit.update_milestone(m, status=WORK)
    story.orbit.update_milestone(m, status=DONE)
    assert whole(story.orbit).plan.set_after == 1


def test_moving_the_deadline_after_closing_does_not_improve_the_plan(story: Story) -> None:
    story.project()
    m = milestone(story, -10, -5)
    story.orbit.update_milestone(m, due_date=d(-1))
    [item] = whole(story.orbit).plan.items
    assert (item.due, item.days) == (d(-10), 5)


def test_a_deadline_set_by_the_closing_action_itself_is_not_a_plan(
    story: Story, session: Session
) -> None:
    story.project()
    m = story.on(-30).orbit.add_milestone("a", "M")
    story.on(-5)
    last = Orbit(session, Actor.VLADIMIR, story.clock)
    last.update_milestone(m.id, due_date=d(-5), status=DONE)
    story.on(0)
    assert whole(story.orbit).plan.set_after == 1


def test_moves_of_the_deadline_before_closing_are_counted(story: Story) -> None:
    story.project()
    m = story.on(-30).orbit.add_milestone("a", "M", due_date=d(-20))
    story.on(-21).orbit.update_milestone(m.id, due_date=d(-10))
    story.on(-11).orbit.update_milestone(m.id, due_date=d(-6))
    story.on(-5).orbit.update_milestone(m.id, status=DONE)
    story.on(0)
    [item] = whole(story.orbit).plan.items
    assert (item.due, item.moves, item.days) == (d(-6), 2, 1)


def test_a_cleared_deadline_is_no_plan(story: Story) -> None:
    story.project()
    m = story.on(-30).orbit.add_milestone("a", "M", due_date=d(-20))
    story.on(-21).orbit.update_milestone(m.id, due_date=None)
    story.on(-5).orbit.update_milestone(m.id, status=DONE)
    story.on(0)
    assert whole(story.orbit).plan.no_due == 1


def test_automatic_deadlines_are_named(story: Story, session: Session) -> None:
    story.project()
    auto = Orbit(session, Actor.VLADIMIR, story.clock, auto_dates=True)
    story.on(-30)
    m = auto.add_milestone("a", "M")
    story.on(-5).orbit.update_milestone(m.id, status=DONE)
    story.on(0)
    [item] = whole(story.orbit).plan.items
    assert item.automatic is True
    milestone(story, -10, -8)
    assert sorted(i.automatic for i in whole(story.orbit).plan.items) == [False, True]


def test_born_closed_milestones_are_not_compared(story: Story) -> None:
    story.project()
    story.orbit.add_milestone("a", "M", status=DONE, due_date=d(-3))
    plan = whole(story.orbit).plan
    assert (plan.items, plan.born_closed) == ([], 1)


# --- what did not happen ------------------------------


def test_undone_start_is_not_a_start(story: Story, session: Session) -> None:
    story.project()
    task = story.on(-9).orbit.add_task("a", "T")
    slip = Orbit(session, Actor.VLADIMIR, story.clock)
    slip.update_task(task.id, status=WORK)
    undo(Orbit(session, Actor.VLADIMIR, story.clock))
    story.on(-5).orbit.update_task(task.id, status=WORK)
    story.on(-3).orbit.update_task(task.id, status=DONE)
    story.on(0)
    assert [i.days for i in whole(story.orbit).cycle.items] == [2]


def test_undone_edit_is_not_movement(story: Story, session: Session) -> None:
    story.on(-9).project()
    story.on(-4)
    Orbit(session, Actor.VLADIMIR, story.clock).update_project("a", status=Status.PAUSED)
    undo(Orbit(session, Actor.VLADIMIR, story.clock))
    story.on(0)
    [row] = whole(story.orbit).focus
    assert row.last_day is None


def test_a_row_under_a_reused_id_has_its_own_history(story: Story) -> None:
    """SQLite gives the id of a deleted row to the next one."""
    story.project()
    first = story.on(-9).orbit.add_task("a", "Old", status=WORK)
    old_id = first.id
    story.orbit.delete_task(old_id)
    second = story.on(-3).orbit.add_task("a", "New")
    assert second.id == old_id
    story.orbit.update_task(second.id, status=DONE)
    story.on(0)
    cycle = whole(story.orbit).cycle
    assert (cycle.known, cycle.no_start) == (0, 1)


def test_sql_and_python_agree_on_what_was_undone(
    orbit: Orbit, session: Session, clock: FakeClock
) -> None:
    """One rule lives in two languages: in rules.canceled_out and in events_in_force.sql."""

    def fresh() -> Orbit:
        clock.advance(minutes=1)
        return Orbit(session, Actor.VLADIMIR, clock)

    fresh().add_project("a", name="A")
    fresh().update_project("a", summary="1")
    fresh().update_project("a", summary="2")
    undo(fresh())
    undo(fresh())
    redo(fresh())
    fresh().update_project("a", summary="3")
    undo(fresh())
    redo(fresh())
    undo(fresh())
    a.prepare(orbit)
    alive = set(session.execute(text("SELECT batch FROM events_in_force")).scalars())
    rows = session.execute(text("SELECT batch, undoes FROM events ORDER BY id DESC")).all()
    dead = canceled_out([(batch, undoes) for batch, undoes in dict.fromkeys(map(tuple, rows))])
    assert dead
    assert alive == {batch for batch, _ in rows} - dead


# --- deadlines ------------------------------


def test_deadlines_are_about_today_whatever_the_period(story: Story) -> None:
    story.project(due_date=d(20))
    story.orbit.add_task("a", "Late", status=WORK, due_date=d(-3))
    story.orbit.add_milestone("a", "Soon", due_date=d(14))
    story.orbit.add_task("a", "Closed", status=DONE, due_date=d(1))
    result = a.analyze(story.orbit, a.Period(d(-400), d(-390)))
    assert [(i.title, i.days) for i in result.deadlines] == [("Late", -3), ("Soon", 14)]


def test_deadlines_under_a_filter(story: Story) -> None:
    for slug in ("a", "b"):
        story.project(slug, due_date=d(2))
    assert [i.project for i in whole(story.orbit, "b").deadlines] == ["b"]


def test_unknown_project_is_an_error(orbit: Orbit) -> None:
    with pytest.raises(NotFoundError):
        whole(orbit, "nope")


# --- one truth ------------------------------


def test_sql_and_the_tree_agree_on_the_days_of_work(session: Session, clock: FakeClock) -> None:
    """The timeline counts them in Python, the analytics in SQL."""
    seed_demo(session, today=TODAY)
    orbit = Orbit(session, Actor.SYSTEM, clock)
    a.prepare(orbit)
    facts = {
        row.id: (row.started, row.done)
        for row in session.execute(text("SELECT id, started, done FROM task_facts"))
    }
    nodes = [n for p in orbit.tree(include_archived=True) for n in p.tasks]
    nodes += [n for p in orbit.tree(include_archived=True) for m in p.milestones for n in m.tasks]
    leaves = [n for n in nodes if not n.children and n.task.status != Status.CANCELED]
    assert len(leaves) > 15
    for node in leaves:
        actual = (node.actual.start, node.actual.end)
        assert facts[node.task.id] == tuple(day and day.isoformat() for day in actual)
