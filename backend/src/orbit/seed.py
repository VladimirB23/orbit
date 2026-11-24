"""Fictional demo data for screenshots and demos (`orbit seed --demo`).

The data is replayed through the domain service with a moving clock, so the
history in events looks like four weeks of real work by Vladimir and Claude.
All dates are relative to `today`: the demo always has overdue and upcoming items.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit.db.models import Event, Milestone, Project, Task
from orbit.domain.enums import Actor
from orbit.domain.enums import Status as S
from orbit.domain.service import Orbit


@dataclass
class _ReplayClock:
    base: date
    current: datetime = field(init=False)

    def __post_init__(self) -> None:
        self.at(28)

    def at(self, days_ago: int, hour: int = 10) -> None:
        local = datetime.combine(self.base - timedelta(days=days_ago), time(hour))
        self.current = local.astimezone().astimezone(UTC)

    def now(self) -> datetime:
        return self.current

    def today(self) -> date:
        return self.base


def seed_demo(session: Session, today: date) -> dict[str, int]:
    clock = _ReplayClock(today)
    vlad = Orbit(session, actor=Actor.VLADIMIR, clock=clock)
    claude = Orbit(session, actor=Actor.CLAUDE, clock=clock)

    def d(offset: int) -> date:
        return today + timedelta(days=offset)

    # --- Coffee Shop Sales Dashboard: the main, healthy project -----------------
    clock.at(27, 9)
    vlad.add_project(
        "coffee-dashboard",
        name="Coffee Shop Sales Dashboard",
        status=S.PLANNED,
        priority=3,
        start_date=d(-27),
        due_date=d(10),
        summary="Tableau dashboard for a fictional coffee chain: revenue, peak hours, loyalty",
    )
    clock.at(27, 11)
    m_collect = claude.add_milestone("coffee-dashboard", "Data collection", due_date=d(-20))
    m_clean = claude.add_milestone("coffee-dashboard", "Data cleaning", due_date=d(-16))
    m_kpi = claude.add_milestone("coffee-dashboard", "KPI design", due_date=d(3))
    m_dash = claude.add_milestone("coffee-dashboard", "Tableau dashboard", due_date=d(10))
    gen = claude.add_task("coffee-dashboard", "Generate sales dataset", milestone_id=m_collect.id)
    load = claude.add_task("coffee-dashboard", "Load CSV into SQLite", milestone_id=m_collect.id)

    clock.at(26)
    vlad.update_project("coffee-dashboard", status=S.IN_PROGRESS)
    vlad.update_milestone(m_collect.id, status=S.IN_PROGRESS)
    claude.update_task(gen.id, status=S.IN_PROGRESS)
    clock.at(24, 15)
    claude.update_task(gen.id, status=S.DONE, comment="50k orders, 12 stores, 2 years")
    claude.update_task(load.id, status=S.IN_PROGRESS)
    clock.at(22, 12)
    claude.update_task(load.id, status=S.DONE)
    vlad.update_milestone(m_collect.id, status=S.DONE)

    clock.at(21)
    vlad.update_milestone(m_clean.id, status=S.IN_PROGRESS)
    dup = claude.add_task(
        "coffee-dashboard", "Remove duplicate orders", milestone_id=m_clean.id, status=S.IN_PROGRESS
    )
    names = claude.add_task("coffee-dashboard", "Normalize store names", milestone_id=m_clean.id)
    clock.at(18, 16)
    claude.update_task(dup.id, status=S.DONE, comment="1.3% duplicates from POS retries")
    claude.update_task(names.id, status=S.DONE)
    clock.at(14, 18)
    vlad.update_milestone(m_clean.id, status=S.DONE, summary="Finished 2 days late")

    clock.at(13)
    vlad.update_milestone(m_kpi.id, status=S.IN_PROGRESS)
    kpis = vlad.add_task("coffee-dashboard", "Define KPI list", milestone_id=m_kpi.id, priority=3)
    rph = claude.add_task("coffee-dashboard", "Revenue per hour", milestone_id=m_kpi.id)
    churn = claude.add_task("coffee-dashboard", "Loyalty churn metric", milestone_id=m_kpi.id)
    claude.add_task(
        "coffee-dashboard", "Average ticket by store", milestone_id=m_kpi.id, status=S.PLANNED
    )
    clock.at(11, 17)
    vlad.update_task(kpis.id, status=S.DONE, comment="8 KPIs, agreed with the 'owner'")
    clock.at(9)
    claude.update_task(rph.id, status=S.IN_PROGRESS, due_date=d(2))
    clock.at(5, 14)
    claude.update_task(churn.id, status=S.BLOCKED, comment="Waiting for the loyalty table export")

    clock.at(4)
    vlad.add_task("coffee-dashboard", "Sketch layout", milestone_id=m_dash.id, priority=2)
    vlad.add_task("coffee-dashboard", "Build sheets", milestone_id=m_dash.id)
    vlad.add_task(
        "coffee-dashboard",
        "Publish to Tableau Public",
        milestone_id=m_dash.id,
        priority=4,
        due_date=d(10),
    )

    # --- SQL Interview Practice: one overdue milestone --------------------------
    clock.at(25, 20)
    vlad.add_project(
        "sql-practice",
        name="SQL Interview Practice",
        status=S.IN_PROGRESS,
        priority=2,
        start_date=d(-25),
        summary="50 interview tasks: joins, CTEs, window functions",
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
    vlad.update_task(recursive.id, status=S.CANCELED, comment="Rare in interviews, skip")
    claude.update_milestone(m_cte.id, status=S.DONE)
    clock.at(10, 21)
    vlad.update_milestone(m_window.id, status=S.IN_PROGRESS)
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
    vlad.add_task("sql-practice", "Book a mock interview slot", milestone_id=m_mock.id, priority=3)

    # --- Home Budget Tracker: paused --------------------------------------------
    clock.at(20, 19)
    vlad.add_project(
        "home-budget",
        name="Home Budget Tracker",
        status=S.IN_PROGRESS,
        priority=1,
        summary="Bank CSV import and monthly categories",
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
    vlad.update_task(rules.id, status=S.PAUSED, comment="Back after the dashboard is published")
    vlad.update_milestone(m_import.id, status=S.PAUSED)
    vlad.update_project("home-budget", status=S.PAUSED, summary="Paused until the dashboard ships")

    # --- Reading List: backlog idea with a subtask ------------------------------
    clock.at(7, 23)
    vlad.add_project(
        "reading-list", name="Reading List", summary="Track books and notes, maybe a Telegram bot"
    )
    vlad.add_task("reading-list", "Pick a stack")
    goodreads = vlad.add_task("reading-list", "Import Goodreads export")
    vlad.add_task("reading-list", "Map shelves to statuses", parent_id=goodreads.id)

    # --- Portfolio Site: finished and archived ----------------------------------
    clock.at(28, 12)
    vlad.add_project(
        "portfolio-site",
        name="Portfolio Site",
        status=S.IN_PROGRESS,
        start_date=d(-28),
        due_date=d(-8),
        summary="Static site with project cards",
    )
    m_launch = claude.add_milestone("portfolio-site", "Launch", status=S.IN_PROGRESS)
    cards = claude.add_task("portfolio-site", "Project cards", milestone_id=m_launch.id)
    deploy = claude.add_task("portfolio-site", "Deploy", milestone_id=m_launch.id)
    clock.at(16, 13)
    claude.update_task(cards.id, status=S.DONE)
    clock.at(9, 13)
    claude.update_task(deploy.id, status=S.DONE, comment="Live on GitHub Pages")
    vlad.update_milestone(m_launch.id, status=S.DONE)
    vlad.update_project("portfolio-site", status=S.DONE)
    clock.at(3, 10)
    vlad.archive_project("portfolio-site")

    session.flush()
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in (Project, Milestone, Task, Event)
    }
