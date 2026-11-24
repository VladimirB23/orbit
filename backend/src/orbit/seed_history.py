"""Half a year of fictional history for a public dashboard (`orbit seed --demo --half-year`).

Everything is invented, and so are the stories a reader will find in it: tasks get faster in the
second half, milestones with data run late, August has a vacation, a project of the highest
priority gets almost no attention. The README of a dashboard must say so.

The same `until` always gives the same history: a published dashboard can be rebuilt.
"""

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from random import Random
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.db.models import Commit, Event, Milestone, Project, Task, WorkSession
from orbit.domain.enums import Actor
from orbit.domain.enums import Status as S
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionRecord
from orbit.seed import ReplayClock, commits_of

DAYS = 182
VACATION = (110, 99)  # days before the end, both included
SEED = 20260525

# --- what people do in milestones -------------------------------------------------

WORK = {
    "Scope": (
        "Write the brief",
        "List the questions to answer",
        "Agree on the metrics",
        "Draft the plan",
    ),
    "Data collection": (
        "Find the sources",
        "Load the raw files",
        "Check the row counts",
        "Describe the columns",
        "Automate the download",
    ),
    "Data cleaning": (
        "Remove duplicates",
        "Fix the date formats",
        "Normalize the names",
        "Fill the gaps",
        "Handle the outliers",
        "Write the quality checks",
    ),
    "Analysis": (
        "Explore the distributions",
        "Compare the segments",
        "Build the cohort table",
        "Test the main hypothesis",
        "Write the final queries",
        "Check the edge cases",
    ),
    "Dashboard": (
        "Sketch the layout",
        "Build the KPI tiles",
        "Build the trend chart",
        "Add the filters",
        "Write the tooltips",
        "Polish the colors",
    ),
    "Release": ("Write the README", "Record a short demo", "Publish", "Collect the feedback"),
    "Core": (
        "Set up the project",
        "Design the schema",
        "Write the main loop",
        "Handle the errors",
        "Cover with tests",
    ),
    "Integrations": (
        "Connect the API",
        "Store the settings",
        "Retry on failures",
        "Log what happens",
        "Limit the requests",
    ),
    "Joins and aggregates": (
        "Solve the easy joins",
        "Solve the anti-joins",
        "Group and filter",
        "Write down the mistakes",
    ),
    "Window functions": (
        "ROW_NUMBER and RANK",
        "Running totals",
        "LAG and LEAD",
        "Gaps and islands",
        "Median without MEDIAN",
    ),
    "CTEs": ("Rewrite subqueries", "Recursive calendar", "Walk a tree", "Compare the plans"),
    "Mock interviews": (
        "Book a mock interview",
        "Solve three tasks aloud",
        "Review the recording",
        "Repeat the weak topics",
    ),
    "Resume": ("Collect the facts", "Write the first draft", "Ask for a review", "Final version"),
    "Applications": (
        "Pick twenty vacancies",
        "Write the cover letter",
        "Send the first ten",
        "Track the replies",
        "Prepare the answers",
    ),
}


@dataclass(frozen=True)
class Plan:
    slug: str
    name: str
    summary: str
    priority: int
    begins: int  # days before the end
    milestones: tuple[str, ...]
    gap: float  # mean days between tasks of one lane
    code: bool = True
    sessions: float = 0.85  # chance of a session on the first day of a task
    pauses: int | None = None  # days before the end
    due: int | None = None  # days after the end


PLANS = (
    Plan(
        "coffee-dashboard",
        "Coffee Shop Sales Dashboard",
        "Tableau dashboard for a fictional coffee chain",
        3,
        178,
        ("Scope", "Data collection", "Data cleaning", "Analysis", "Dashboard", "Release"),
        gap=6.2,
        due=10,
    ),
    Plan(
        "sql-practice",
        "SQL Interview Practice",
        "Tasks by topic: joins, CTEs, window functions",
        2,
        180,
        ("Joins and aggregates", "CTEs", "Window functions", "Analysis", "Mock interviews"),
        gap=11.0,
        due=20,
    ),
    Plan(
        "transit-eda",
        "City Transit EDA",
        "Open data of city buses: delays by line and hour",
        2,
        158,
        ("Scope", "Data collection", "Data cleaning", "Analysis", "Release"),
        gap=0.9,
    ),
    Plan(
        "home-budget",
        "Home Budget Tracker",
        "Bank statements by category, month over month",
        1,
        140,
        ("Core", "Data collection", "Data cleaning", "Dashboard"),
        gap=4.2,
        pauses=24,
    ),
    Plan(
        "churn-analysis",
        "Retail Churn Analysis",
        "Who leaves a fictional shop and when it can be seen",
        3,
        96,
        ("Scope", "Data collection", "Data cleaning", "Analysis", "Dashboard", "Release"),
        gap=2.4,
        due=18,
    ),
    Plan(
        "weather-bot",
        "Weather Alerts Bot",
        "A bot that warns about frost in the evening",
        1,
        84,
        ("Core", "Integrations", "Release"),
        gap=11.0,
        due=9,
    ),
    Plan(
        "portfolio-site",
        "Portfolio Site",
        "One page per project, with a chart and a conclusion",
        1,
        48,
        ("Scope", "Core", "Dashboard", "Release"),
        gap=1.5,
        sessions=1.0,
        due=12,
    ),
    Plan(
        "loyalty-test",
        "Loyalty A/B Test",
        "Does the new loyalty card bring people back: design, data, result",
        2,
        25,
        ("Scope", "Data collection", "Data cleaning", "Analysis", "Dashboard"),
        gap=2.2,
        due=24,
    ),
    Plan(
        "job-search",
        "Job Search",
        "Resume, applications, interviews",
        4,
        52,
        ("Resume", "Applications", "Mock interviews"),
        gap=8.0,
        code=False,
        sessions=0.25,
        due=60,
    ),
)


# --- simulation ---------------------------------------------------------------------


@dataclass
class _Story:
    """Actions are gathered in any order and then replayed in the order of time."""

    until: date
    rnd: Random = field(default_factory=lambda: Random(SEED))
    actions: list[tuple[datetime, int, Callable[[], object]]] = field(default_factory=list)
    sessions: list[SessionRecord] = field(default_factory=list)

    def day(self, index: float) -> date:
        return self.until - timedelta(days=DAYS) + timedelta(days=round(index))

    def off(self, index: int) -> bool:
        left = DAYS - index
        return VACATION[1] <= left <= VACATION[0]

    def workday(self, index: float, weekend: float = 0.35) -> int:
        """The day itself, or the next one somebody works on."""
        n = math.ceil(index)
        while self.off(n) or (self.day(n).weekday() >= 5 and self.rnd.random() > weekend):
            n += 1
        return n

    def at(self, index: int, hour: int, action: Callable[[], object], minute: int = 0) -> None:
        if index <= DAYS:
            moment = datetime.combine(self.day(index), datetime.min.time())
            self.actions.append(
                (moment.replace(hour=hour, minute=minute), len(self.actions), action)
            )

    def cycle(self, index: int, kind: str) -> int:
        typical = 4.6 if index < DAYS / 2 else 2.2
        if "Data" in kind:
            typical *= 1.5
        return min(round(self.rnd.lognormvariate(math.log(typical), 0.55)), 24)


def seed_history(session: Session, until: date) -> dict[str, int]:
    clock = ReplayClock(until)
    story = _Story(until)
    vlad = Orbit(session, Actor.VLADIMIR, clock)
    claude = Orbit(session, Actor.CLAUDE, clock)
    vlad.batch = claude.batch = None  # a whole story is not one action to undo

    for plan in PLANS:
        _project(story, plan, vlad, claude)
    story.at(120, 22, lambda: vlad.add_project("reading-list", name="Reading List"))
    for n, title in enumerate(("Pick a stack", "Import the old list", "Map the shelves")):
        story.at(121 + n, 22, lambda t=title: vlad.add_task("reading-list", t))  # type: ignore[misc]

    for moment, _, action in sorted(story.actions, key=lambda a: a[:2]):
        clock.local(moment)
        action()
    clock.local(datetime.combine(until, datetime.min.time()).replace(hour=23))

    claude.import_sessions(story.sessions)
    for plan in PLANS:
        own = [s for s in story.sessions if s.project == plan.slug]
        claude.import_commits(plan.slug, commits_of(own))
    session.flush()
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in (Project, Milestone, Task, Event, WorkSession, Commit)
    }


def _project(story: _Story, plan: Plan, vlad: Orbit, claude: Orbit) -> None:
    begin = DAYS - plan.begins
    story.at(
        begin,
        9,
        lambda: vlad.add_project(
            plan.slug,
            name=plan.name,
            summary=plan.summary,
            priority=plan.priority,
            start_date=story.day(begin),
            due_date=None if plan.due is None else story.day(DAYS + plan.due),
        ),
    )
    story.at(begin, 10, lambda: vlad.update_project(plan.slug, status=S.IN_PROGRESS))
    stop = DAYS - plan.pauses if plan.pauses is not None else DAYS + 400

    day: float = begin + 1
    for number, kind in enumerate(plan.milestones):
        day = _milestone(story, plan, kind, day, stop, (vlad, claude))
        if number == len(plan.milestones) - 1 and plan.pauses is None and day < DAYS - 6:
            end = story.workday(day)
            story.at(end, 21, lambda: vlad.update_project(plan.slug, status=S.DONE, force=True))
            story.at(end + 5, 12, lambda: vlad.archive_project(plan.slug))
    if plan.pauses is not None:
        story.at(
            stop,
            20,
            lambda: vlad.update_project(
                plan.slug, status=S.PAUSED, summary="Paused until the churn analysis is done"
            ),
        )


def _milestone(
    story: _Story, plan: Plan, kind: str, day: float, stop: int, actors: tuple[Orbit, Orbit]
) -> float:
    """Two lanes of tasks; returns the day the milestone was over."""
    rnd, (vlad, claude) = story.rnd, actors
    begin = story.workday(day)
    titles = WORK[kind]
    # The plan is made before the work: from a typical pace, and too brave where there is data.
    pace = (2.9 if begin >= DAYS / 2 else 5.0) + plan.gap
    hope = 0.85 if "Data" in kind else 1.25
    due = begin + max(3, round(len(titles) / 2 * pace * hope + rnd.uniform(-1, 1)))
    row: dict[str, Milestone] = {}

    def add() -> None:
        row["m"] = claude.add_milestone(
            plan.slug, kind, start_date=story.day(begin), due_date=story.day(due)
        )

    story.at(max(begin - 2, DAYS - plan.begins), 11, add)
    story.at(begin, 11, lambda: vlad.update_milestone(row["m"].id, status=S.IN_PROGRESS), 30)

    lanes = [float(begin), float(begin)]
    ends = [begin]
    for title in titles:
        lane = lanes.index(min(lanes))
        start = story.workday(lanes[lane])
        end = _task(story, plan, kind, title, (begin, start, stop), row, actors)
        ends.append(end)
        lanes[lane] = end + rnd.expovariate(1 / plan.gap)
    over = max(ends)
    if over > due and rnd.random() < 0.45:
        # Seen coming: the deadline is moved once, and not far enough.
        later = due + rnd.randint(2, 4)
        story.at(due - 1, 19, lambda: vlad.update_milestone(row["m"].id, due_date=story.day(later)))
    if over <= stop:
        done = lambda: vlad.update_milestone(row["m"].id, status=S.DONE, force=True)  # noqa: E731
        story.at(over, 21, done)
    return over + rnd.randint(0, 2)


def _task(
    story: _Story,
    plan: Plan,
    kind: str,
    title: str,
    days: tuple[int, int, int],
    parent: dict[str, Milestone],
    actors: tuple[Orbit, Orbit],
) -> int:
    rnd, (vlad, claude) = story.rnd, actors
    born, start, stop = days
    who = claude if rnd.random() < 0.6 else vlad
    minute = rnd.randint(0, 59)
    row: dict[str, Task] = {}
    luck = rnd.random()

    def add(status: S = S.PLANNED, due: date | None = None) -> None:
        row["t"] = who.add_task(
            plan.slug,
            title,
            milestone_id=parent["m"].id,
            status=status,
            priority=rnd_priority,
            due_date=due,
        )

    rnd_priority = rnd.choice((0, 0, 1, 2, 2, 3))
    if luck < 0.04:  # written down when it was over already
        story.at(start, 13, lambda: add(S.DONE), minute)
        return start
    cycle = story.cycle(start, kind)
    blocked = rnd.randint(3, 8) if rnd.random() < 0.13 else 0
    end = story.workday(start + cycle + blocked, weekend=0.5)
    due = story.day(start + (3 if start >= DAYS / 2 else 5)) if rnd.random() < 0.5 else None
    story.at(born, 12, lambda: add(due=due), minute)
    if luck > 0.97:
        story.at(start, 15, lambda: who.update_task(row["t"].id, status=S.CANCELED), minute)
        return start
    if start >= stop:
        return end
    if luck > 0.12:  # otherwise closed without ever being "in progress"
        story.at(start, 13, lambda: who.update_task(row["t"].id, status=S.IN_PROGRESS), minute)
    if blocked and cycle:
        middle = start + max(1, cycle // 2)
        story.at(middle, 16, lambda: who.update_task(row["t"].id, status=S.BLOCKED), minute)
        story.at(
            middle + blocked,
            10,
            lambda: who.update_task(row["t"].id, status=S.IN_PROGRESS),
            minute,
        )
    if end >= stop:
        story.at(stop, 19, lambda: who.update_task(row["t"].id, status=S.PAUSED), minute)
    else:
        story.at(end, 20, lambda: who.update_task(row["t"].id, status=S.DONE), minute)
    _sessions(story, plan, title, start, min(end, stop))
    return end


def _sessions(story: _Story, plan: Plan, title: str, start: int, end: int) -> None:
    rnd = story.rnd
    days = [start] if rnd.random() < plan.sessions else []
    if end > start + 1 and rnd.random() < plan.sessions * 0.55:
        days.append(story.workday(end - 1))
    for day in days:
        if day > DAYS or story.off(day):
            continue
        began = datetime.combine(story.day(day), datetime.min.time())
        began = began.replace(hour=rnd.randint(13, 20), minute=rnd.randint(0, 59)).astimezone()
        story.sessions.append(
            SessionRecord(
                external_id=str(uuid5(NAMESPACE_URL, f"history/{plan.slug}/{title}/{day}/{began}")),
                project=plan.slug,
                started_at=began,
                ended_at=began + timedelta(minutes=rnd.randint(25, 150)),
                title=title,
                prompts=rnd.randint(3, 18),
                files=rnd.randint(0, 9),
                commits=rnd.randint(0, 4) if plan.code else 0,
                folder=None,
            )
        )
