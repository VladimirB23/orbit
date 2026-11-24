"""Domain service: the only way data changes. Every change is written to events.

The service flushes but never commits: the caller (CLI command, API request)
owns the transaction, so one command is all-or-nothing.
"""

import json
import re
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from orbit.db.models import (
    COMMENT_MAX,
    SESSION_TITLE_MAX,
    SUMMARY_MAX,
    Base,
    Event,
    Milestone,
    Project,
    Task,
    WorkSession,
)
from orbit.domain.clock import Clock, SystemClock
from orbit.domain.enums import CLOSED_STATUSES, Action, Actor, Entity, Status
from orbit.domain.errors import ConflictError, NotFoundError, ValidationError
from orbit.domain.rules import (
    Actual,
    actual_span,
    canceled_out,
    earliest_sign,
    is_overdue,
    is_upcoming,
    milestone_progress,
    next_done_at,
    parse_priority,
    parse_status,
    project_progress,
    with_children,
)
from orbit.domain.sessions import SessionImport, SessionRecord

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SLUG_MAX = 64
NAME_MAX = 200
TITLE_MAX = 300
UPCOMING_DAYS = 7

PROJECT_FIELDS = frozenset(
    {
        "slug",
        "name",
        "status",
        "priority",
        "start_date",
        "due_date",
        "summary",
        "obsidian_path",
        "repo_path",
        "github_url",
        "position",
    }
)
MILESTONE_FIELDS = frozenset({"name", "status", "start_date", "due_date", "summary", "position"})
TASK_FIELDS = frozenset(
    {
        "title",
        "status",
        "priority",
        "start_date",
        "due_date",
        "comment",
        "position",
        "milestone_id",
        "parent_id",
    }
)


# --- value cleaning -----------------------------------------------------------


def _required_text(name: str, limit: int) -> Callable[[Any], str]:
    def clean(value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValidationError(f"{name} must not be empty")
        if len(text) > limit:
            raise ValidationError(f"{name} is longer than {limit} characters")
        return text

    return clean


def _optional_text(name: str, limit: int) -> Callable[[Any], str | None]:
    def clean(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) > limit:
            raise ValidationError(f"{name} is longer than {limit} characters ({len(text)})")
        return text or None

    return clean


def _slug(value: Any) -> str:
    slug = str(value or "").strip()
    if len(slug) > SLUG_MAX or not SLUG_RE.fullmatch(slug):
        raise ValidationError(
            f"invalid slug '{slug}': use lowercase latin letters, digits and single dashes"
        )
    return slug


def _date(value: Any) -> date | None:
    if value is None or isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError(f"invalid date '{value}', expected YYYY-MM-DD") from None


def _optional_id(value: Any) -> int | None:
    return None if value is None else int(value)


def _position(value: Any) -> int:
    position = int(value)
    if position < 0:
        raise ValidationError("position must be >= 0")
    return position


CLEANERS: dict[str, Callable[[Any], Any]] = {
    "slug": _slug,
    "name": _required_text("name", NAME_MAX),
    "title": _required_text("title", TITLE_MAX),
    "status": lambda v: parse_status(str(v)).value,
    "priority": lambda v: parse_priority(v).value,
    "start_date": _date,
    "due_date": _date,
    "summary": _optional_text("summary", SUMMARY_MAX),
    "comment": _optional_text("comment", COMMENT_MAX),
    "obsidian_path": _optional_text("obsidian_path", 500),
    "repo_path": _optional_text("repo_path", 500),
    "github_url": _optional_text("github_url", 500),
    "position": _position,
    "milestone_id": _optional_id,
    "parent_id": _optional_id,
}


def _clean(values: dict[str, Any]) -> dict[str, Any]:
    return {key: CLEANERS[key](value) for key, value in values.items()}


def check_dates(start: date | None, due: date | None) -> None:
    if start is not None and due is not None and start > due:
        raise ValidationError(f"start date {start} is after due date {due}")


def to_text(value: Any) -> str | None:
    """How a value is stored in events.old_value / new_value."""
    if value is None:
        return None
    if isinstance(value, date | datetime):
        return value.isoformat()
    return str(value)


def snapshot(row: Base) -> dict[str, Any]:
    """All columns of a row as JSON-friendly values."""
    result: dict[str, Any] = {}
    for column in row.__table__.columns:
        value = getattr(row, column.key)
        result[column.key] = value.isoformat() if isinstance(value, date | datetime) else value
    return result


# --- read models --------------------------------------------------------------


@dataclass
class Signals:
    """What happens below a row: shown when the row is collapsed."""

    in_progress: int = 0
    blocked: int = 0
    overdue: int = 0
    upcoming: int = 0

    def count(self, status: str, overdue: bool, upcoming: bool, below: "Signals") -> None:
        """Add one child row together with everything below it."""
        self.in_progress += (status == Status.IN_PROGRESS) + below.in_progress
        self.blocked += (status == Status.BLOCKED) + below.blocked
        self.overdue += overdue + below.overdue
        self.upcoming += upcoming + below.upcoming


class FocusKind(StrEnum):
    CURRENT = "current"
    NEXT = "next"


@dataclass
class Focus:
    """Where the project stands right now, or what comes next."""

    entity: Entity
    id: int
    title: str
    kind: FocusKind


@dataclass
class TaskNode:
    task: Task
    overdue: bool
    upcoming: bool
    actual: Actual
    signals: Signals = field(default_factory=Signals)
    children: list["TaskNode"] = field(default_factory=list)


@dataclass
class MilestoneNode:
    milestone: Milestone
    progress: float
    overdue: bool
    upcoming: bool
    actual: Actual
    signals: Signals = field(default_factory=Signals)
    tasks: list[TaskNode] = field(default_factory=list)


@dataclass
class ProjectNode:
    project: Project
    progress: float
    overdue: bool
    upcoming: bool
    actual: Actual
    focus: Focus | None
    signals: Signals = field(default_factory=Signals)
    milestones: list[MilestoneNode] = field(default_factory=list)
    tasks: list[TaskNode] = field(default_factory=list)  # tasks without a milestone


def _task_signals(nodes: Iterable[TaskNode]) -> Signals:
    """Bottom-up totals for a list of sibling tasks; fills the nodes on the way."""
    total = Signals()
    for node in nodes:
        node.signals = _task_signals(node.children)
        total.count(node.task.status, node.overdue, node.upcoming, node.signals)
    return total


def _task_actuals(nodes: Iterable[TaskNode]) -> list[date | None]:
    """Subtasks count for the tasks above them; returns signs of work for the row above."""
    signs: list[date | None] = []
    for node in nodes:
        node.actual = with_children(node.actual, _task_actuals(node.children))
        signs.append(earliest_sign(node.actual, Status(node.task.status)))
    return signs


def _focus(milestones: Sequence[Milestone], tasks: Sequence[Task]) -> Focus | None:
    """Milestone in progress, else task in progress, else the next open milestone."""
    for m in milestones:
        if m.status == Status.IN_PROGRESS:
            return Focus(Entity.MILESTONE, m.id, m.name, FocusKind.CURRENT)
    for t in tasks:
        if t.status == Status.IN_PROGRESS:
            return Focus(Entity.TASK, t.id, t.title, FocusKind.CURRENT)
    for m in milestones:
        if Status(m.status) not in CLOSED_STATUSES:
            return Focus(Entity.MILESTONE, m.id, m.name, FocusKind.NEXT)
    return None


@dataclass
class ReportItem:
    entity: str
    id: int
    project: str
    title: str
    status: str
    due_date: date | None


@dataclass
class StatusReport:
    today: date
    in_progress: list[ReportItem]
    blocked: list[ReportItem]
    overdue: list[ReportItem]
    upcoming: list[ReportItem]


# --- service ------------------------------------------------------------------


class Orbit:
    def __init__(self, session: Session, actor: Actor, clock: Clock | None = None) -> None:
        self.session = session
        self.actor = actor
        self.clock: Clock = clock or SystemClock()
        # Events of one instance are one action for undo; None: not for undo.
        self.batch: str | None = uuid4().hex
        self.undoes: str | None = None

    # --- events ---------------------------------------------------------------

    def log(
        self,
        entity: Entity,
        entity_id: int,
        action: Action,
        field: str | None = None,
        old: Any = None,
        new: Any = None,
    ) -> None:
        self.session.add(
            Event(
                at=self.clock.now(),
                actor=self.actor.value,
                entity=entity.value,
                entity_id=entity_id,
                action=action.value,
                field=field,
                old_value=to_text(old),
                new_value=to_text(new),
                batch=self.batch,
                undoes=self.undoes,
            )
        )

    def events(
        self,
        since: datetime | None = None,
        entity: str | None = None,
        entity_id: int | None = None,
        limit: int | None = None,
    ) -> list[Event]:
        query = select(Event).order_by(Event.at.desc(), Event.id.desc())
        if since is not None:
            query = query.where(Event.at >= since)
        if entity is not None:
            query = query.where(Event.entity == Entity(entity).value)
        if entity_id is not None:
            query = query.where(Event.entity_id == entity_id)
        if limit:
            query = query.limit(limit)
        return list(self.session.scalars(query))[::-1]

    # --- generic create / update / delete -------------------------------------

    def _status_history(self) -> dict[tuple[str, int], list[tuple[Status, date]]]:
        """Statuses every row has entered, oldest first.

        SQLite reuses ids of deleted rows, so a row's history starts at its own creation.
        What has been undone never happened.
        """
        undone = self.session.execute(
            select(Event.batch, Event.undoes)
            .where(Event.undoes.is_not(None))
            .group_by(Event.batch, Event.undoes)
            .order_by(func.max(Event.id).desc())
        )
        dead = canceled_out([(batch, undoes) for batch, undoes in undone if batch])
        created = Event.action == Action.CREATE.value
        entered = case(
            (created, func.json_extract(Event.new_value, "$.status")), else_=Event.new_value
        )
        rows = self.session.execute(
            select(Event.entity, Event.entity_id, Event.action, Event.at, entered, Event.batch)
            .where(or_(created, Event.field == "status"))
            .order_by(Event.id)
        )
        history: dict[tuple[str, int], list[tuple[Status, date]]] = {}
        for entity, entity_id, action, at, status, batch in rows:
            if batch in dead:
                continue
            key = (entity, entity_id)
            if action == Action.CREATE.value:
                history[key] = []
            history.setdefault(key, []).append((Status(status), self.clock.day_of(at)))
        return history

    def _next_position(self, model: type[Project | Milestone | Task], *where: Any) -> int:
        current = self.session.scalar(select(func.max(model.position)).where(*where))
        return 0 if current is None else current + 1

    def _create[R: Project | Milestone | Task](self, entity: Entity, row: R) -> R:
        now = self.clock.now()
        row.created_at = now
        row.updated_at = now
        row.done_at = now if row.status == Status.DONE else None
        self.session.add(row)
        self.session.flush()
        self.log(entity, row.id, Action.CREATE, new=json.dumps(snapshot(row), ensure_ascii=False))
        self.session.flush()
        return row

    def _apply[R: Project | Milestone | Task](
        self,
        entity: Entity,
        row: R,
        allowed: frozenset[str],
        changes: dict[str, Any],
        validate: Callable[[R, dict[str, Any]], None],
    ) -> R:
        unknown = sorted(set(changes) - allowed)
        if unknown:
            raise ValidationError(
                f"cannot update {', '.join(unknown)} of a {entity.value};"
                f" allowed: {', '.join(sorted(allowed))}"
            )
        diff = {k: v for k, v in _clean(changes).items() if getattr(row, k) != v}
        if not diff:
            return row
        check_dates(diff.get("start_date", row.start_date), diff.get("due_date", row.due_date))
        validate(row, diff)

        now = self.clock.now()
        if "status" in diff:
            row.done_at = next_done_at(Status(row.status), Status(diff["status"]), row.done_at, now)
        for key, value in diff.items():
            self.log(entity, row.id, Action.UPDATE, key, getattr(row, key), value)
            setattr(row, key, value)
        row.updated_at = now
        self.session.flush()
        return row

    def delete_row(self, entity: Entity, row: Base, row_id: int) -> None:
        self.log(entity, row_id, Action.DELETE, old=json.dumps(snapshot(row), ensure_ascii=False))
        self.session.delete(row)
        self.session.flush()

    @staticmethod
    def _closing(diff: dict[str, Any]) -> bool:
        return "status" in diff and Status(diff["status"]) in CLOSED_STATUSES

    # --- projects -------------------------------------------------------------

    def get_project(self, slug: str) -> Project:
        project = self.session.scalar(select(Project).where(Project.slug == slug))
        if project is None:
            raise NotFoundError(f"project '{slug}' not found")
        return project

    def list_projects(self, include_archived: bool = False) -> list[Project]:
        query = select(Project).order_by(Project.position, Project.id)
        if not include_archived:
            query = query.where(Project.archived_at.is_(None))
        return list(self.session.scalars(query))

    def ensure_slug_free(self, slug: str) -> None:
        if self.session.scalar(select(Project.id).where(Project.slug == slug)) is not None:
            raise ValidationError(f"project '{slug}' already exists")

    def add_project(
        self,
        slug: str,
        *,
        name: str,
        status: Status | str = Status.BACKLOG,
        priority: int | str = 0,
        start_date: date | str | None = None,
        due_date: date | str | None = None,
        summary: str | None = None,
        obsidian_path: str | None = None,
        repo_path: str | None = None,
        github_url: str | None = None,
    ) -> Project:
        values = _clean(
            {
                "slug": slug,
                "name": name,
                "status": status,
                "priority": priority,
                "start_date": start_date,
                "due_date": due_date,
                "summary": summary,
                "obsidian_path": obsidian_path,
                "repo_path": repo_path,
                "github_url": github_url,
            }
        )
        check_dates(values["start_date"], values["due_date"])
        self.ensure_slug_free(values["slug"])
        row = Project(**values, position=self._next_position(Project))
        return self._create(Entity.PROJECT, row)

    def update_project(self, slug: str, /, *, force: bool = False, **changes: Any) -> Project:
        def validate(row: Project, diff: dict[str, Any]) -> None:
            if "slug" in diff:
                self.ensure_slug_free(diff["slug"])
            if self._closing(diff) and not force:
                milestones = self._count_open(Milestone, Milestone.project_id == row.id)
                tasks = self._count_open(Task, Task.project_id == row.id)
                if milestones or tasks:
                    raise ConflictError(
                        f"project '{row.slug}' has {milestones} open milestone(s) and"
                        f" {tasks} open task(s); use --force to close it anyway"
                    )

        return self._apply(
            Entity.PROJECT, self.get_project(slug), PROJECT_FIELDS, changes, validate
        )

    def archive_project(self, slug: str) -> Project:
        project = self.get_project(slug)
        if project.archived_at is None:
            now = self.clock.now()
            self.log(Entity.PROJECT, project.id, Action.UPDATE, "archived_at", None, now)
            project.archived_at = now
            project.updated_at = now
            self.session.flush()
        return project

    def unarchive_project(self, slug: str) -> Project:
        project = self.get_project(slug)
        if project.archived_at is not None:
            now = self.clock.now()
            self.log(Entity.PROJECT, project.id, Action.UPDATE, "archived_at", project.archived_at)
            project.archived_at = None
            project.updated_at = now
            self.session.flush()
        return project

    # --- milestones -----------------------------------------------------------

    def get_milestone(self, milestone_id: int) -> Milestone:
        milestone = self.session.get(Milestone, milestone_id)
        if milestone is None:
            raise NotFoundError(f"milestone {milestone_id} not found")
        return milestone

    def list_milestones(self, project_slug: str) -> list[Milestone]:
        project = self.get_project(project_slug)
        query = (
            select(Milestone)
            .where(Milestone.project_id == project.id)
            .order_by(Milestone.position, Milestone.id)
        )
        return list(self.session.scalars(query))

    def add_milestone(
        self,
        project_slug: str,
        name: str,
        *,
        status: Status | str = Status.PLANNED,
        start_date: date | str | None = None,
        due_date: date | str | None = None,
        summary: str | None = None,
    ) -> Milestone:
        project = self.get_project(project_slug)
        values = _clean(
            {
                "name": name,
                "status": status,
                "start_date": start_date,
                "due_date": due_date,
                "summary": summary,
            }
        )
        check_dates(values["start_date"], values["due_date"])
        position = self._next_position(Milestone, Milestone.project_id == project.id)
        row = Milestone(**values, project_id=project.id, position=position)
        return self._create(Entity.MILESTONE, row)

    def update_milestone(
        self, milestone_id: int, /, *, force: bool = False, **changes: Any
    ) -> Milestone:
        def validate(row: Milestone, diff: dict[str, Any]) -> None:
            if self._closing(diff) and not force:
                tasks = self._count_open(Task, Task.milestone_id == row.id)
                if tasks:
                    raise ConflictError(
                        f"milestone {row.id} has {tasks} open task(s);"
                        " use --force to close it anyway"
                    )

        row = self.get_milestone(milestone_id)
        return self._apply(Entity.MILESTONE, row, MILESTONE_FIELDS, changes, validate)

    def delete_milestone(self, milestone_id: int, *, force: bool = False) -> None:
        milestone = self.get_milestone(milestone_id)
        tasks = list(self.session.scalars(select(Task).where(Task.milestone_id == milestone.id)))
        if tasks and not force:
            raise ConflictError(
                f"milestone {milestone.id} has {len(tasks)} task(s); use --force to delete them too"
            )
        for task in tasks:
            if self.session.get(Task, task.id) is not None:  # may be gone as a subtask
                self._delete_task_tree(task)
        self.delete_row(Entity.MILESTONE, milestone, milestone.id)

    # --- tasks ----------------------------------------------------------------

    def get_task(self, task_id: int) -> Task:
        task = self.session.get(Task, task_id)
        if task is None:
            raise NotFoundError(f"task {task_id} not found")
        return task

    def list_tasks(
        self,
        project_slug: str | None = None,
        milestone_id: int | None = None,
        statuses: Iterable[Status | str] | None = None,
    ) -> list[Task]:
        query = select(Task).order_by(Task.project_id, Task.position, Task.id)
        if project_slug is not None:
            query = query.where(Task.project_id == self.get_project(project_slug).id)
        if milestone_id is not None:
            query = query.where(Task.milestone_id == milestone_id)
        if statuses is not None:
            query = query.where(Task.status.in_([parse_status(str(s)).value for s in statuses]))
        return list(self.session.scalars(query))

    def _children(self, task_id: int) -> list[Task]:
        return list(self.session.scalars(select(Task).where(Task.parent_id == task_id)))

    def _descendants(self, task_id: int) -> list[Task]:
        result: list[Task] = []
        stack = [task_id]
        while stack:
            for child in self._children(stack.pop()):
                result.append(child)
                stack.append(child.id)
        return result

    def check_task_links(
        self, project_id: int, milestone_id: int | None, parent_id: int | None, self_id: int | None
    ) -> None:
        if milestone_id is not None:
            milestone = self.get_milestone(milestone_id)
            if milestone.project_id != project_id:
                raise ValidationError(f"milestone {milestone_id} belongs to another project")
        if parent_id is not None:
            parent = self.get_task(parent_id)
            if parent.project_id != project_id:
                raise ValidationError(f"parent task {parent_id} belongs to another project")
            if self_id is not None and (
                parent_id == self_id or parent_id in {t.id for t in self._descendants(self_id)}
            ):
                raise ValidationError(f"task {parent_id} cannot be the parent of task {self_id}")

    def add_task(
        self,
        project_slug: str,
        title: str,
        *,
        milestone_id: int | None = None,
        parent_id: int | None = None,
        status: Status | str = Status.BACKLOG,
        priority: int | str = 0,
        start_date: date | str | None = None,
        due_date: date | str | None = None,
        comment: str | None = None,
    ) -> Task:
        project = self.get_project(project_slug)
        values = _clean(
            {
                "title": title,
                "milestone_id": milestone_id,
                "parent_id": parent_id,
                "status": status,
                "priority": priority,
                "start_date": start_date,
                "due_date": due_date,
                "comment": comment,
            }
        )
        check_dates(values["start_date"], values["due_date"])
        self.check_task_links(project.id, values["milestone_id"], values["parent_id"], None)
        if values["parent_id"] is not None and values["milestone_id"] is None:
            values["milestone_id"] = self.get_task(values["parent_id"]).milestone_id
        position = self._next_position(
            Task,
            Task.project_id == project.id,
            Task.milestone_id.is_(None)
            if values["milestone_id"] is None
            else Task.milestone_id == values["milestone_id"],
            Task.parent_id.is_(None)
            if values["parent_id"] is None
            else Task.parent_id == values["parent_id"],
        )
        row = Task(**values, project_id=project.id, position=position)
        return self._create(Entity.TASK, row)

    def update_task(self, task_id: int, /, *, force: bool = False, **changes: Any) -> Task:
        def validate(row: Task, diff: dict[str, Any]) -> None:
            if "milestone_id" in diff or "parent_id" in diff:
                self.check_task_links(
                    row.project_id,
                    diff.get("milestone_id", row.milestone_id),
                    diff.get("parent_id", row.parent_id),
                    row.id,
                )
            if self._closing(diff) and not force:
                open_children = [
                    t for t in self._descendants(row.id) if Status(t.status) not in CLOSED_STATUSES
                ]
                if open_children:
                    raise ConflictError(
                        f"task {row.id} has {len(open_children)} open subtask(s);"
                        " use --force to close it anyway"
                    )

        return self._apply(Entity.TASK, self.get_task(task_id), TASK_FIELDS, changes, validate)

    def _delete_task_tree(self, task: Task) -> None:
        for child in self._children(task.id):
            self._delete_task_tree(child)
        self.delete_row(Entity.TASK, task, task.id)

    def delete_task(self, task_id: int, *, force: bool = False) -> None:
        task = self.get_task(task_id)
        descendants = self._descendants(task.id)
        if descendants and not force:
            raise ConflictError(
                f"task {task.id} has {len(descendants)} subtask(s); use --force to delete them too"
            )
        self._delete_task_tree(task)

    def _count_open(self, model: type[Milestone | Task], *where: Any) -> int:
        closed = [s.value for s in CLOSED_STATUSES]
        query = select(func.count()).select_from(model).where(*where, model.status.not_in(closed))
        return self.session.scalar(query) or 0

    # --- tree -----------------------------------------------------------------

    def tree(
        self, project_slug: str | None = None, include_archived: bool = False
    ) -> list[ProjectNode]:
        projects = (
            [self.get_project(project_slug)]
            if project_slug is not None
            else self.list_projects(include_archived=include_archived)
        )
        ids = [p.id for p in projects]
        milestones = list(
            self.session.scalars(
                select(Milestone)
                .where(Milestone.project_id.in_(ids))
                .order_by(Milestone.position, Milestone.id)
            )
        )
        tasks = list(
            self.session.scalars(
                select(Task).where(Task.project_id.in_(ids)).order_by(Task.position, Task.id)
            )
        )
        today = self.clock.today()

        history = self._status_history()

        def flags(entity: Entity, row: Project | Milestone | Task) -> tuple[bool, bool, Actual]:
            status = Status(row.status)
            return (
                is_overdue(row.due_date, status, today),
                is_upcoming(row.due_date, status, today, UPCOMING_DAYS),
                actual_span(history.get((entity.value, row.id), []), status),
            )

        task_nodes = {t.id: TaskNode(t, *flags(Entity.TASK, t)) for t in tasks}
        for t in tasks:
            if t.parent_id is not None and t.parent_id in task_nodes:
                task_nodes[t.parent_id].children.append(task_nodes[t.id])

        result: list[ProjectNode] = []
        for p in projects:
            p_tasks = [t for t in tasks if t.project_id == p.id]
            p_milestones = [m for m in milestones if m.project_id == p.id]
            roots = [t for t in p_tasks if t.parent_id is None]
            m_nodes: list[MilestoneNode] = []
            for m in p_milestones:
                m_statuses = [Status(t.status) for t in p_tasks if t.milestone_id == m.id]
                children = [task_nodes[t.id] for t in roots if t.milestone_id == m.id]
                node = MilestoneNode(
                    m,
                    milestone_progress(Status(m.status), m_statuses),
                    *flags(Entity.MILESTONE, m),
                    signals=_task_signals(children),
                    tasks=children,
                )
                node.actual = with_children(node.actual, _task_actuals(children))
                m_nodes.append(node)
            progress = project_progress(
                Status(p.status),
                [(Status(n.milestone.status), n.progress) for n in m_nodes],
                [Status(t.status) for t in p_tasks],
            )
            loose = [task_nodes[t.id] for t in roots if t.milestone_id is None]
            signals = _task_signals(loose)
            for n in m_nodes:
                signals.count(n.milestone.status, n.overdue, n.upcoming, n.signals)
            project = ProjectNode(
                p,
                progress,
                *flags(Entity.PROJECT, p),
                focus=_focus(p_milestones, p_tasks),
                signals=signals,
                milestones=m_nodes,
                tasks=loose,
            )
            signs = [earliest_sign(n.actual, Status(n.milestone.status)) for n in m_nodes]
            project.actual = with_children(project.actual, signs + _task_actuals(loose))
            result.append(project)
        return result

    # --- sessions -------------------------------------------------------------

    def sessions(
        self, project_slug: str | None = None, limit: int | None = None
    ) -> list[WorkSession]:
        """Newest first."""
        query = select(WorkSession).order_by(WorkSession.started_at.desc(), WorkSession.id.desc())
        if project_slug is not None:
            query = query.where(WorkSession.project_id == self.get_project(project_slug).id)
        if limit:
            query = query.limit(limit)
        return list(self.session.scalars(query))

    def import_sessions(self, records: Iterable[SessionRecord]) -> SessionImport:
        """Facts about the past, not edits of the plan: nothing goes to events."""
        result = SessionImport()
        projects = {p.slug: p.id for p in self.list_projects(include_archived=True)}
        known = {row.external_id: row for row in self.session.scalars(select(WorkSession))}
        for record in records:
            project_id = projects.get(record.project)
            if project_id is None:
                count = result.unknown_projects.get(record.project, 0)
                result.unknown_projects[record.project] = count + 1
                continue
            values = {
                "project_id": project_id,
                "started_at": record.started_at,
                "ended_at": record.ended_at,
                "title": record.title[:SESSION_TITLE_MAX],
                "prompts": record.prompts,
                "files": record.files,
                "commits": record.commits,
                "folder": record.folder,
            }
            row = known.get(record.external_id)
            if row is None:
                row = WorkSession(external_id=record.external_id, **values)
                known[record.external_id] = row
                self.session.add(row)
                result.added += 1
                continue
            diff = {key: value for key, value in values.items() if getattr(row, key) != value}
            for key, value in diff.items():
                setattr(row, key, value)
            if diff:
                result.updated += 1
            else:
                result.unchanged += 1
        self.session.flush()
        return result

    # --- status report --------------------------------------------------------

    def status_report(self, days: int = UPCOMING_DAYS) -> StatusReport:
        today = self.clock.today()
        projects = {p.id: p for p in self.list_projects()}
        ids = list(projects)

        items: list[ReportItem] = [
            ReportItem("project", p.id, p.slug, p.name, p.status, p.due_date)
            for p in projects.values()
        ]
        for m in self.session.scalars(
            select(Milestone)
            .where(Milestone.project_id.in_(ids))
            .order_by(Milestone.project_id, Milestone.position, Milestone.id)
        ):
            items.append(
                ReportItem(
                    "milestone", m.id, projects[m.project_id].slug, m.name, m.status, m.due_date
                )
            )
        for t in self.session.scalars(
            select(Task)
            .where(Task.project_id.in_(ids))
            .order_by(Task.project_id, Task.position, Task.id)
        ):
            items.append(
                ReportItem("task", t.id, projects[t.project_id].slug, t.title, t.status, t.due_date)
            )

        def by_due(i: ReportItem) -> date:
            assert i.due_date is not None
            return i.due_date

        return StatusReport(
            today=today,
            in_progress=[i for i in items if i.status == Status.IN_PROGRESS],
            blocked=[i for i in items if i.status == Status.BLOCKED],
            overdue=sorted(
                (i for i in items if is_overdue(i.due_date, Status(i.status), today)), key=by_due
            ),
            upcoming=sorted(
                (i for i in items if is_upcoming(i.due_date, Status(i.status), today, days)),
                key=by_due,
            ),
        )
