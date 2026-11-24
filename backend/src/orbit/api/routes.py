"""REST endpoints. Business rules live in the domain layer, not here."""

from collections.abc import Iterator
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from orbit import __version__
from orbit.api import schemas as s
from orbit.api.errors import ERROR_RESPONSES
from orbit.api.paths import API_V1
from orbit.api.state import AppState
from orbit.config import is_demo
from orbit.db.models import COMMENT_MAX, SUMMARY_MAX
from orbit.domain import undo
from orbit.domain.analytics import Period, all_time, analyze
from orbit.domain.enums import Actor, Entity
from orbit.domain.service import NAME_MAX, TITLE_MAX, UPCOMING_DAYS, Orbit

router = APIRouter(prefix=API_V1, responses=ERROR_RESPONSES)


def get_state(request: Request) -> AppState:
    state: AppState = request.app.state.orbit
    return state


StateDep = Annotated[AppState, Depends(get_state)]


def get_orbit(state: StateDep) -> Iterator[Orbit]:
    """One request = one transaction. ORBIT_ACTOR is ignored on purpose: the
    interface belongs to Vladimir even when the server was started by Claude.
    """
    with Session(state.engine, expire_on_commit=False) as session:
        yield Orbit(session, actor=Actor.VLADIMIR, clock=state.clock, auto_dates=state.auto_dates)
        session.commit()


# scope="function": commit before the response is sent, so 200 means "saved".
OrbitDep = Annotated[Orbit, Depends(get_orbit, scope="function")]
Force = Annotated[bool, Query(description="Allow closing or deleting with open children.")]


# --- reading ------------------------------------------------------------------


@router.get("/meta")
def meta(state: StateDep) -> s.MetaOut:
    return s.MetaOut(
        version=__version__,
        database=s.DatabaseOut(name=state.db.name, demo=is_demo(state.db)),
        limits=s.LimitsOut(
            name=NAME_MAX, title=TITLE_MAX, summary=SUMMARY_MAX, comment=COMMENT_MAX
        ),
        upcoming_days=UPCOMING_DAYS,
        vault=state.vault.name if state.vault else None,
    )


@router.get("/tree")
def tree(orbit: OrbitDep, archived: bool = False) -> s.TreeOut:
    nodes = orbit.tree(include_archived=archived)
    return s.TreeOut(
        today=orbit.clock.today(),
        projects=[s.ProjectNodeOut.model_validate(node) for node in nodes],
    )


@router.get("/events")
def events(
    orbit: OrbitDep,
    entity: Entity | None = None,
    id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
) -> list[s.EventOut]:
    """Change journal, newest first."""
    rows = orbit.events(entity=entity, entity_id=id, limit=limit)
    return [s.EventOut.model_validate(row) for row in reversed(rows)]


@router.get("/sessions")
def sessions(
    orbit: OrbitDep,
    project: str | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
) -> list[s.SessionOut]:
    """Claude sessions, newest first."""
    rows = orbit.sessions(project, limit=limit)
    return [s.SessionOut.model_validate(row) for row in rows]


@router.get("/analytics")
def analytics(
    orbit: OrbitDep,
    start: date | None = None,
    end: date | None = None,
    project: str | None = None,
) -> s.AnalyticsOut:
    """Local days, both included; without a start: since the first known fact."""
    last = end or orbit.clock.today()
    first = start or min(all_time(orbit).start, last)
    return s.AnalyticsOut.model_validate(analyze(orbit, Period(first, last), project))


# --- undo -----------------------------------------------------------------------


@router.post("/undo")
def undo_last(orbit: OrbitDep) -> s.UndoneOut:
    """Take back the last action of Vladimir; 409 when somebody has changed it since."""
    return s.UndoneOut.model_validate(undo.undo(orbit))


@router.post("/redo")
def redo_last(orbit: OrbitDep) -> s.UndoneOut:
    return s.UndoneOut.model_validate(undo.redo(orbit))


# --- projects -----------------------------------------------------------------


@router.post("/projects", status_code=201)
def create_project(body: s.ProjectCreate, orbit: OrbitDep) -> s.ProjectOut:
    return s.ProjectOut.model_validate(orbit.add_project(**body.model_dump()))


@router.patch("/projects/{slug}")
def update_project(
    slug: str, body: s.ProjectPatch, orbit: OrbitDep, force: Force = False
) -> s.ProjectOut:
    row = orbit.update_project(slug, force=force, **body.changes())
    return s.ProjectOut.model_validate(row)


@router.post("/projects/{slug}/archive")
def archive_project(slug: str, orbit: OrbitDep) -> s.ProjectOut:
    return s.ProjectOut.model_validate(orbit.archive_project(slug))


@router.post("/projects/{slug}/unarchive")
def unarchive_project(slug: str, orbit: OrbitDep) -> s.ProjectOut:
    return s.ProjectOut.model_validate(orbit.unarchive_project(slug))


# --- milestones ---------------------------------------------------------------


@router.post("/projects/{slug}/milestones", status_code=201)
def create_milestone(slug: str, body: s.MilestoneCreate, orbit: OrbitDep) -> s.MilestoneOut:
    data = body.model_dump()
    return s.MilestoneOut.model_validate(orbit.add_milestone(slug, data.pop("name"), **data))


@router.patch("/milestones/{milestone_id}")
def update_milestone(
    milestone_id: int, body: s.MilestonePatch, orbit: OrbitDep, force: Force = False
) -> s.MilestoneOut:
    row = orbit.update_milestone(milestone_id, force=force, **body.changes())
    return s.MilestoneOut.model_validate(row)


@router.delete("/milestones/{milestone_id}", status_code=204)
def delete_milestone(milestone_id: int, orbit: OrbitDep, force: Force = False) -> Response:
    orbit.delete_milestone(milestone_id, force=force)
    return Response(status_code=204)


# --- tasks --------------------------------------------------------------------


@router.post("/projects/{slug}/tasks", status_code=201)
def create_task(slug: str, body: s.TaskCreate, orbit: OrbitDep) -> s.TaskOut:
    data = body.model_dump()
    return s.TaskOut.model_validate(orbit.add_task(slug, data.pop("title"), **data))


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int, body: s.TaskPatch, orbit: OrbitDep, force: Force = False
) -> s.TaskOut:
    row = orbit.update_task(task_id, force=force, **body.changes())
    return s.TaskOut.model_validate(row)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, orbit: OrbitDep, force: Force = False) -> Response:
    orbit.delete_task(task_id, force=force)
    return Response(status_code=204)
