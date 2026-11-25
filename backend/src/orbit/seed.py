"""Fictional demo data for screenshots and demos (`orbit seed --demo`).

The data is replayed through the domain service with a moving clock, so the
history in events looks like four weeks of real work by a person and Claude.
All dates are relative to `today`: the demo always has overdue and upcoming items.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.db.models import Commit, Event, Milestone, Project, Task, WorkSession
from orbit.domain.commits import CommitRecord
from orbit.domain.enums import Actor
from orbit.domain.enums import Status as S
from orbit.domain.service import Orbit
from orbit.domain.sessions import SessionRecord


@dataclass
class ReplayClock:
    """Stands where a story puts it; `today` is the end of the story."""

    base: date
    current: datetime = field(init=False)

    def __post_init__(self) -> None:
        self.at(28)

    def at(self, days_ago: int, hour: int = 10) -> None:
        self.local(datetime.combine(self.base - timedelta(days=days_ago), time(hour)))

    def local(self, moment: datetime) -> None:
        self.current = moment.astimezone().astimezone(UTC)

    def now(self) -> datetime:
        return self.current

    def today(self) -> date:
        return self.base

    def day_of(self, moment: datetime) -> date:
        return moment.astimezone().date()


def seed_demo(session: Session, today: date) -> dict[str, int]:
    clock = ReplayClock(today)
    owner = Orbit(session, actor=Actor.OWNER, clock=clock)
    claude = Orbit(session, actor=Actor.CLAUDE, clock=clock)
    owner.batch = claude.batch = None  # a whole story is not one action to undo

    def d(offset: int) -> date:
        return today + timedelta(days=offset)

    # --- Coffee Shop Sales Dashboard: the main, healthy project -----------------
    clock.at(27, 9)
    owner.add_project(
        "coffee-dashboard",
        name="Coffee Shop Sales Dashboard",
        status=S.PLANNED,
        priority=3,
        start_date=d(-27),
        due_date=d(10),
        summary="Tableau dashboard for a fictional coffee chain: revenue, peak hours, loyalty",
        obsidian_path="Inbox/coffee-dashboard/0. coffee-dashboard - Overview.md",
        repo_path="D:\\Projects\\coffee-dashboard",
    )
    clock.at(27, 11)
    m_collect = claude.add_milestone("coffee-dashboard", "Data collection", due_date=d(-20))
    m_clean = claude.add_milestone("coffee-dashboard", "Data cleaning", due_date=d(-16))
    m_kpi = claude.add_milestone("coffee-dashboard", "KPI design", due_date=d(3))
    m_dash = claude.add_milestone(
        "coffee-dashboard", "Tableau dashboard", start_date=d(4), due_date=d(10)
    )
    gen = claude.add_task("coffee-dashboard", "Generate sales dataset", milestone_id=m_collect.id)
    load = claude.add_task("coffee-dashboard", "Load CSV into SQLite", milestone_id=m_collect.id)

    clock.at(26)
    owner.update_project("coffee-dashboard", status=S.IN_PROGRESS)
    owner.update_milestone(m_collect.id, status=S.IN_PROGRESS)
    claude.update_task(gen.id, status=S.IN_PROGRESS)
    clock.at(24, 15)
    claude.update_task(gen.id, status=S.DONE, comment="50k orders, 12 stores, 2 years")
    claude.update_task(load.id, status=S.IN_PROGRESS)
    clock.at(22, 12)
    claude.update_task(load.id, status=S.DONE)
    owner.update_milestone(m_collect.id, status=S.DONE)

    clock.at(21)
    owner.update_milestone(m_clean.id, status=S.IN_PROGRESS)
    dup = claude.add_task(
        "coffee-dashboard", "Remove duplicate orders", milestone_id=m_clean.id, status=S.IN_PROGRESS
    )
    names = claude.add_task("coffee-dashboard", "Normalize store names", milestone_id=m_clean.id)
    clock.at(18, 16)
    claude.update_task(dup.id, status=S.DONE, comment="1.3% duplicates from POS retries")
    claude.update_task(names.id, status=S.DONE)
    clock.at(14, 18)
    owner.update_milestone(m_clean.id, status=S.DONE, summary="Finished 2 days late")

    clock.at(13)
    owner.update_milestone(m_kpi.id, status=S.IN_PROGRESS)
    kpis = owner.add_task("coffee-dashboard", "Define KPI list", milestone_id=m_kpi.id, priority=3)
    rph = claude.add_task("coffee-dashboard", "Revenue per hour", milestone_id=m_kpi.id)
    churn = claude.add_task("coffee-dashboard", "Loyalty churn metric", milestone_id=m_kpi.id)
    claude.add_task(
        "coffee-dashboard", "Average ticket by store", milestone_id=m_kpi.id, status=S.PLANNED
    )
    clock.at(11, 17)
    owner.update_task(kpis.id, status=S.DONE, comment="8 KPIs, agreed with the 'owner'")
    clock.at(9)
    claude.update_task(rph.id, status=S.IN_PROGRESS, due_date=d(2))
    clock.at(8)
    claude.update_task(churn.id, status=S.IN_PROGRESS)
    clock.at(5, 14)
    claude.update_task(churn.id, status=S.BLOCKED, comment="Waiting for the loyalty table export")

    clock.at(4)
    owner.add_task("coffee-dashboard", "Sketch layout", milestone_id=m_dash.id, priority=2)
    owner.add_task(
        "coffee-dashboard",
        "Build sheets",
        milestone_id=m_dash.id,
        start_date=d(5),
        due_date=d(9),
    )
    owner.add_task(
        "coffee-dashboard",
        "Publish to Tableau Public",
        milestone_id=m_dash.id,
        priority=4,
        due_date=d(10),
    )

    # --- SQL Interview Practice: one overdue milestone --------------------------
    clock.at(25, 20)
    owner.add_project(
        "sql-practice",
        name="SQL Interview Practice",
        status=S.IN_PROGRESS,
        priority=2,
        start_date=d(-25),
        summary="50 interview tasks: joins, CTEs, window functions",
        obsidian_path="Inbox/sql-practice/0. sql-practice - Overview.md",
        repo_path="D:\\Projects\\sql-practice",
    )
    m_joins = claude.add_milestone("sql-practice", "Joins and aggregates", due_date=d(-18))
    m_cte = claude.add_milestone("sql-practice", "CTEs", due_date=d(-10))
    m_window = claude.add_milestone("sql-practice", "Window functions", due_date=d(-3))
    m_mock = claude.add_milestone("sql-practice", "Mock interview", due_date=d(6))
    clock.at(19, 21)
    claude.update_milestone(m_joins.id, status=S.DONE, summary="18 of 18 tasks solved")
    clock.at(17, 21)
    claude.add_task("sql-practice", "Recursive CTE puzzles", milestone_id=m_cte.id)
    clock.at(12, 21)
    recursive = claude.list_tasks("sql-practice", m_cte.id)[0]
    owner.update_task(recursive.id, status=S.CANCELED, comment="Rare in interviews, skip")
    claude.update_milestone(m_cte.id, status=S.DONE)
    clock.at(10, 21)
    owner.update_milestone(m_window.id, status=S.IN_PROGRESS)
    rn = claude.add_task("sql-practice", "ROW_NUMBER vs RANK", milestone_id=m_window.id)
    run = claude.add_task("sql-practice", "Running totals", milestone_id=m_window.id)
    lag = claude.add_task(
        "sql-practice", "LAG/LEAD for retention", milestone_id=m_window.id, due_date=d(-1)
    )
    claude.add_task("sql-practice", "Gaps and islands", milestone_id=m_window.id)
    clock.at(8, 22)
    claude.update_task(rn.id, status=S.DONE)
    clock.at(6, 22)
    claude.update_task(run.id, status=S.DONE)
    claude.update_task(
        lag.id, status=S.IN_PROGRESS, comment="Cohort query works, need monthly view"
    )
    clock.at(2, 20)
    owner.add_task("sql-practice", "Book a mock interview slot", milestone_id=m_mock.id, priority=3)

    # --- Home Budget Tracker: paused --------------------------------------------
    clock.at(20, 19)
    owner.add_project(
        "home-budget",
        name="Home Budget Tracker",
        status=S.IN_PROGRESS,
        priority=1,
        summary="Bank CSV import and monthly categories",
        repo_path="D:\\Projects\\home-budget",
    )
    m_import = claude.add_milestone(
        "home-budget", "Bank CSV import", status=S.IN_PROGRESS, due_date=d(-5)
    )
    parse = claude.add_task("home-budget", "Parse bank statement", milestone_id=m_import.id)
    rules = claude.add_task("home-budget", "Category rules", milestone_id=m_import.id)
    clock.at(15, 19)
    claude.update_task(parse.id, status=S.DONE)
    claude.update_task(rules.id, status=S.IN_PROGRESS)
    clock.at(10, 9)
    owner.update_task(rules.id, status=S.PAUSED, comment="Back after the dashboard is published")
    owner.update_milestone(m_import.id, status=S.PAUSED)
    owner.update_project("home-budget", status=S.PAUSED, summary="Paused until the dashboard ships")

    # --- Reading List: a future project, only an idea so far --------------------
    clock.at(7, 23)
    owner.add_project(
        "reading-list", name="Reading List", summary="Track books and notes, maybe a Telegram bot"
    )
    owner.add_task("reading-list", "Pick a stack")
    goodreads = owner.add_task("reading-list", "Import Goodreads export")
    owner.add_task("reading-list", "Map shelves to statuses", parent_id=goodreads.id)

    # --- Portfolio Site: finished and archived ----------------------------------
    clock.at(28, 12)
    owner.add_project(
        "portfolio-site",
        name="Portfolio Site",
        status=S.IN_PROGRESS,
        start_date=d(-28),
        due_date=d(-8),
        summary="Static site with project cards",
        repo_path="D:\\Projects\\portfolio-site",
    )
    m_launch = claude.add_milestone("portfolio-site", "Launch", status=S.IN_PROGRESS)
    cards = claude.add_task("portfolio-site", "Project cards", milestone_id=m_launch.id)
    deploy = claude.add_task("portfolio-site", "Deploy", milestone_id=m_launch.id)
    clock.at(16, 13)
    claude.update_task(cards.id, status=S.DONE)
    clock.at(9, 13)
    claude.update_task(deploy.id, status=S.DONE, comment="Live on GitHub Pages")
    owner.update_milestone(m_launch.id, status=S.DONE)
    owner.update_project("portfolio-site", status=S.DONE)
    clock.at(3, 10)
    owner.archive_project("portfolio-site")

    sessions = _demo_sessions(today)
    claude.import_sessions(sessions)
    for slug in {s.project for s in sessions}:
        claude.import_commits(slug, commits_of([s for s in sessions if s.project == slug]))
    session.flush()
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in (Project, Milestone, Task, Event, WorkSession, Commit)
    }


def commits_of(sessions: Iterable[SessionRecord]) -> list[CommitRecord]:
    """Commits spread evenly over the sessions they were made in."""
    return [
        CommitRecord(
            sha=uuid5(NAMESPACE_URL, f"{s.external_id}/{n}").hex,
            committed_at=s.started_at + (s.ended_at - s.started_at) * (n + 1) / (s.commits + 1),
        )
        for s in sessions
        for n in range(s.commits)
    ]


def _demo_sessions(today: date) -> list[SessionRecord]:
    # project, days ago, start hour, minutes, title, prompts, files, commits
    rows = [
        ("coffee-dashboard", 27, 11, 95, "Plan the dashboard and milestones", 9, 3, 1),
        ("coffee-dashboard", 24, 13, 150, "Generate 50k fictional orders", 14, 6, 3),
        ("coffee-dashboard", 18, 14, 125, "Clean duplicates and store names", 11, 8, 4),
        ("coffee-dashboard", 9, 10, 80, "Revenue per hour in SQL", 7, 4, 2),
        ("coffee-dashboard", 1, 19, 65, "Loyalty export: what is missing", 5, 1, 0),
        ("sql-practice", 10, 20, 70, "Window functions, part one", 12, 2, 1),
        ("sql-practice", 6, 21, 55, "Retention with LAG and LEAD", 8, 2, 1),
    ]
    sessions = []
    for slug, days_ago, hour, minutes, title, prompts, files, commits in rows:
        start = datetime.combine(today - timedelta(days=days_ago), time(hour)).astimezone(UTC)
        sessions.append(
            SessionRecord(
                external_id=str(uuid5(NAMESPACE_URL, f"orbit-demo/{slug}/{days_ago}")),
                project=slug,
                started_at=start,
                ended_at=start + timedelta(minutes=minutes),
                title=title,
                prompts=prompts,
                files=files,
                commits=commits,
                folder=f"D:\\Projects\\{slug}",
            )
        )
    return sessions
