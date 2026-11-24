"""Request and response shapes. TypeScript types of the UI are generated from them."""

from datetime import date, datetime
from typing import Any, ClassVar, Self

from pydantic import BaseModel, ConfigDict, model_validator

from orbit.domain.enums import Action, Actor, Entity, Status
from orbit.domain.service import FocusKind

# --- responses ----------------------------------------------------------------


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProjectOut(Out):
    id: int
    slug: str
    name: str
    status: Status
    priority: int
    start_date: date | None
    due_date: date | None
    summary: str | None
    obsidian_path: str | None
    repo_path: str | None
    github_url: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None
    archived_at: datetime | None


class MilestoneOut(Out):
    id: int
    project_id: int
    name: str
    status: Status
    start_date: date | None
    due_date: date | None
    summary: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None


class TaskOut(Out):
    id: int
    project_id: int
    milestone_id: int | None
    parent_id: int | None
    title: str
    status: Status
    priority: int
    start_date: date | None
    due_date: date | None
    comment: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    done_at: datetime | None


class SignalsOut(Out):
    in_progress: int
    blocked: int
    overdue: int
    upcoming: int


class ActualOut(Out):
    """Dates from the journal, not from the plan."""

    start: date | None
    end: date | None


class FocusOut(Out):
    entity: Entity
    id: int
    title: str
    kind: FocusKind


class TaskNodeOut(Out):
    task: TaskOut
    overdue: bool
    upcoming: bool
    actual: ActualOut
    signals: SignalsOut
    children: list["TaskNodeOut"]


class MilestoneNodeOut(Out):
    milestone: MilestoneOut
    progress: float
    overdue: bool
    upcoming: bool
    actual: ActualOut
    signals: SignalsOut
    tasks: list[TaskNodeOut]


class ProjectNodeOut(Out):
    project: ProjectOut
    progress: float
    overdue: bool
    upcoming: bool
    actual: ActualOut
    focus: FocusOut | None
    signals: SignalsOut
    milestones: list[MilestoneNodeOut]
    tasks: list[TaskNodeOut]


class TreeOut(Out):
    today: date
    projects: list[ProjectNodeOut]


class EventOut(Out):
    id: int
    at: datetime
    actor: Actor
    entity: Entity
    entity_id: int
    action: Action
    field: str | None
    old_value: str | None
    new_value: str | None


class UndoneOut(Out):
    """What has been taken back or brought back, as it was done."""

    entity: Entity
    id: int
    title: str
    action: Action
    fields: list[str]
    count: int


class SessionOut(Out):
    id: int
    external_id: str
    project_id: int
    started_at: datetime
    ended_at: datetime
    title: str
    prompts: int
    files: int
    commits: int
    folder: str | None


class LimitsOut(BaseModel):
    name: int
    title: int
    summary: int
    comment: int


class DatabaseOut(BaseModel):
    name: str
    demo: bool


class MetaOut(BaseModel):
    version: str
    database: DatabaseOut
    limits: LimitsOut
    upcoming_days: int
    vault: str | None  # name of the Obsidian vault, for links; its path stays here


class ErrorBody(BaseModel):
    type: str
    message: str


class ErrorOut(BaseModel):
    error: ErrorBody


# --- requests -----------------------------------------------------------------


class In(BaseModel):
    """Only shape and types; business rules live in the domain layer."""

    model_config = ConfigDict(extra="forbid")


class ProjectCreate(In):
    slug: str
    name: str
    status: Status = Status.BACKLOG
    priority: int = 0
    start_date: date | None = None
    due_date: date | None = None
    summary: str | None = None
    obsidian_path: str | None = None
    repo_path: str | None = None
    github_url: str | None = None


class MilestoneCreate(In):
    name: str
    status: Status = Status.PLANNED
    start_date: date | None = None
    due_date: date | None = None
    summary: str | None = None


class TaskCreate(In):
    title: str
    milestone_id: int | None = None
    parent_id: int | None = None
    status: Status = Status.BACKLOG
    priority: int = 0
    start_date: date | None = None
    due_date: date | None = None
    comment: str | None = None


class Patch(In):
    """A field that is not sent stays as is; null clears an optional field."""

    REQUIRED: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="after")
    def _required_fields_are_not_null(self) -> Self:
        for name in sorted(self.model_fields_set & self.REQUIRED):
            if getattr(self, name) is None:
                raise ValueError(f"{name} must not be null")
        return self

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class ProjectPatch(Patch):
    REQUIRED: ClassVar[frozenset[str]] = frozenset(
        {"slug", "name", "status", "priority", "position"}
    )

    slug: str | None = None
    name: str | None = None
    status: Status | None = None
    priority: int | None = None
    start_date: date | None = None
    due_date: date | None = None
    summary: str | None = None
    obsidian_path: str | None = None
    repo_path: str | None = None
    github_url: str | None = None
    position: int | None = None


class MilestonePatch(Patch):
    REQUIRED: ClassVar[frozenset[str]] = frozenset({"name", "status", "position"})

    name: str | None = None
    status: Status | None = None
    start_date: date | None = None
    due_date: date | None = None
    summary: str | None = None
    position: int | None = None


class TaskPatch(Patch):
    REQUIRED: ClassVar[frozenset[str]] = frozenset({"title", "status", "priority", "position"})

    title: str | None = None
    status: Status | None = None
    priority: int | None = None
    start_date: date | None = None
    due_date: date | None = None
    comment: str | None = None
    milestone_id: int | None = None
    parent_id: int | None = None
    position: int | None = None
