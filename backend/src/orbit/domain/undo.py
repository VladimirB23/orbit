"""Undo and redo by the journal. A way back is a new change: nothing is erased from events.

One Orbit instance is one action (a request, a command): its events share a batch. Only the
actions of the same actor are taken back, and only while nobody has changed the same thing since.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, cast

from sqlalchemy import Date, Integer, select

from orbit.db.models import Event, Milestone, Project, Task, WorkSession
from orbit.db.types import UTCDateTime
from orbit.domain.enums import Action, Entity, Status
from orbit.domain.errors import ConflictError, NotFoundError, ValidationError
from orbit.domain.rules import canceled_out
from orbit.domain.service import Orbit, check_dates, snapshot, to_text

type Row = Project | Milestone | Task

MODELS: dict[Entity, type[Row]] = {
    Entity.PROJECT: Project,
    Entity.MILESTONE: Milestone,
    Entity.TASK: Task,
}
# A key pressed by mistake must not take back the work of yesterday.
UNDO_WINDOW = timedelta(hours=12)


@dataclass
class Undone:
    """What has been taken back, as it was done."""

    entity: Entity
    id: int
    title: str
    action: Action
    fields: list[str] = field(default_factory=list)
    count: int = 1  # rows touched


@dataclass(frozen=True)
class _Batch:
    id: str
    undoes: str | None


def undo(orbit: Orbit) -> Undone:
    batches = _recent(orbit)
    dead = canceled_out([(b.id, b.undoes) for b in batches])
    for batch in batches:
        if batch.undoes is None and batch.id not in dead:
            return _take_back(orbit, batch.id)
    raise NotFoundError("nothing to undo")


def redo(orbit: Orbit) -> Undone:
    """Takes back the last undo, unless something new has been done after it."""
    batches = _recent(orbit)
    undoes = {b.id: b.undoes for b in batches}
    skip: set[str] = set()
    for batch in batches:
        if batch.id in skip:
            continue
        if batch.undoes is None:
            break
        if undoes.get(batch.undoes) is not None:  # a redo: the undo below is spent
            skip.add(batch.undoes)
            continue
        return _take_back(orbit, batch.id)
    raise NotFoundError("nothing to redo")


def _recent(orbit: Orbit) -> list[_Batch]:
    """Actions of this actor, newest first."""
    rows = orbit.session.execute(
        select(Event.batch, Event.undoes)
        .where(
            Event.actor == orbit.actor.value,
            Event.batch.is_not(None),
            Event.at >= orbit.clock.now() - UNDO_WINDOW,
        )
        .order_by(Event.id.desc())
    )
    return list(dict.fromkeys(_Batch(batch, undoes) for batch, undoes in rows if batch))


def _take_back(orbit: Orbit, batch: str) -> Undone:
    events = list(
        orbit.session.scalars(select(Event).where(Event.batch == batch).order_by(Event.id.desc()))
    )
    orbit.undoes = batch
    try:
        for event in events:
            _revert(orbit, event)
            orbit.session.flush()
        for event in events:
            _check(orbit, event)
    except (NotFoundError, ValidationError) as problem:
        raise ConflictError(str(problem)) from problem
    return _describe(orbit, events)


def _find(orbit: Orbit, event: Event) -> Row | None:
    row = orbit.session.get(MODELS[Entity(event.entity)], event.entity_id)
    return cast(Row | None, row)


def _revert(orbit: Orbit, event: Event) -> None:
    entity = Entity(event.entity)
    row = _find(orbit, event)
    if event.action == Action.DELETE:
        if row is not None:
            raise ConflictError(f"{entity.value} {event.entity_id} is taken by a new row")
        _restore(orbit, entity, event)
    elif row is None:
        raise ConflictError(f"{entity.value} {event.entity_id} has been deleted since")
    elif event.action == Action.CREATE:
        _remove(orbit, entity, row, event)
    else:
        _set_back(orbit, entity, row, event)


def _set_back(orbit: Orbit, entity: Entity, row: Row, event: Event) -> None:
    name = event.field or ""
    if to_text(getattr(row, name)) != event.new_value:
        raise ConflictError(f"{name} of {entity.value} {row.id} has changed since")
    if name == "slug":
        orbit.ensure_slug_free(event.old_value or "")
    if name == "parent_id" and isinstance(row, Task):
        # Before the change: a loop of parents, once written, cannot be walked.
        orbit.check_task_links(row.project_id, None, _value(row, name, event.old_value), row.id)
    if name == "status":
        row.done_at = _done_moment(orbit, event)
    orbit.log(entity, row.id, Action.UPDATE, name, event.new_value, event.old_value)
    setattr(row, name, _value(row, name, event.old_value))
    row.updated_at = orbit.clock.now()


def _done_moment(orbit: Orbit, event: Event) -> datetime | None:
    """When the row had entered the status it returns to, if that status is done."""
    if event.old_value != Status.DONE:
        return None
    earlier = orbit.session.scalars(
        select(Event)
        .where(
            Event.entity == event.entity,
            Event.entity_id == event.entity_id,
            Event.id < event.id,
        )
        .order_by(Event.id.desc())
    )
    for e in earlier:
        entered = e.new_value if e.field == "status" else None
        if e.action == Action.CREATE:
            created = json.loads(e.new_value or "{}")
            if created.get("status") == Status.DONE:
                moment = created.get("done_at")
                return datetime.fromisoformat(moment) if moment else e.at
            break
        if entered == Status.DONE:
            return e.at
    return orbit.clock.now()


def _remove(orbit: Orbit, entity: Entity, row: Row, event: Event) -> None:
    born = json.loads(event.new_value or "{}")
    now = snapshot(row)
    moved = {"updated_at", "done_at", "position"}
    if any(born.get(key) != value for key, value in now.items() if key not in moved):
        raise ConflictError(f"{entity.value} {row.id} has changed since")
    if _has_inside(orbit, entity, row.id):
        raise ConflictError(f"{entity.value} {row.id} is not empty any more")
    orbit.delete_row(entity, row, row.id)


def _has_inside(orbit: Orbit, entity: Entity, row_id: int) -> bool:
    links = {
        Entity.PROJECT: [
            Milestone.project_id == row_id,
            Task.project_id == row_id,
            WorkSession.project_id == row_id,
        ],
        Entity.MILESTONE: [Task.milestone_id == row_id],
        Entity.TASK: [Task.parent_id == row_id],
    }
    return any(
        orbit.session.scalar(select(link.left).where(link).limit(1)) is not None
        for link in links[entity]
    )


def _restore(orbit: Orbit, entity: Entity, event: Event) -> None:
    saved = json.loads(event.old_value or "{}")
    model = MODELS[entity]
    row = model(**{key: _value(model, key, to_text(value)) for key, value in saved.items()})
    if isinstance(row, Project):
        orbit.ensure_slug_free(row.slug)
    elif orbit.session.get(Project, row.project_id) is None:
        raise ConflictError("the project has been deleted since")
    if isinstance(row, Task):
        orbit.check_task_links(row.project_id, row.milestone_id, row.parent_id, None)
    row.updated_at = orbit.clock.now()
    orbit.session.add(row)
    orbit.session.flush()
    text = json.dumps(snapshot(row), ensure_ascii=False)
    orbit.log(entity, row.id, Action.CREATE, new=text)


def _check(orbit: Orbit, event: Event) -> None:
    """Old values were fine together then; together with what has changed since, maybe not."""
    row = _find(orbit, event)
    if row is None:
        return
    check_dates(row.start_date, row.due_date)
    if isinstance(row, Task):
        orbit.check_task_links(row.project_id, row.milestone_id, None, row.id)


def _value(owner: Any, name: str, text: str | None) -> Any:
    """Back from the way values are written in events."""
    if text is None:
        return None
    kind = owner.__table__.columns[name].type
    if isinstance(kind, UTCDateTime):
        return datetime.fromisoformat(text)
    if isinstance(kind, Date):
        return date.fromisoformat(text)
    return int(text) if isinstance(kind, Integer) else text


def _describe(orbit: Orbit, events: Sequence[Event]) -> Undone:
    own = [e for e in events if e.actor == orbit.actor.value]  # without automatic dates
    last = (own or events)[0]  # for a deleted branch: its root
    row = _find(orbit, last)
    saved = snapshot(row) if row else json.loads(last.new_value or last.old_value or "{}")
    touched = {(e.entity, e.entity_id) for e in events}
    return Undone(
        entity=Entity(last.entity),
        id=last.entity_id,
        title=str(saved.get("title") or saved.get("name") or ""),
        action=Action(last.action),
        fields=sorted({e.field for e in events if e.field}),
        count=len(touched),
    )
