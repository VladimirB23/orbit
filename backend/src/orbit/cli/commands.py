"""orbit CLI: thin layer over the domain service. Every command supports --json."""

import json
import os
import re
import webbrowser
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time, timedelta
from http.client import HTTPConnection, HTTPException
from pathlib import Path
from typing import Annotated, Any

import typer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from orbit import __version__, serialize
from orbit.cli import render
from orbit.config import (
    DEFAULT_DB_PATH,
    DEFAULT_PORT,
    DEMO_DB_PATH,
    is_demo,
    load_settings,
    settings_file,
)
from orbit.db.backup import auto_backup, backup_dir, copy_database
from orbit.db.engine import current_revision, ensure_schema, head_revision, make_engine
from orbit.db.models import Commit, Event, Milestone, Project, Task, WorkSession
from orbit.domain import undo
from orbit.domain.commits import CommitRecord
from orbit.domain.enums import CLOSED_STATUSES, Entity, Status
from orbit.domain.errors import ConflictError, NotFoundError, OrbitError, ValidationError
from orbit.domain.rules import actor_from_env, is_overdue
from orbit.domain.service import Orbit
from orbit.gitlog import local_folder, read_commits
from orbit.journal import read_journals
from orbit.seed import seed_demo

app = typer.Typer(
    help="Orbit: projects, milestones and tasks with statuses and deadlines.",
    no_args_is_help=True,
    rich_markup_mode=None,
    pretty_exceptions_enable=False,
)
project_app = typer.Typer(help="Projects (addressed by slug).", no_args_is_help=True)
milestone_app = typer.Typer(help="Milestones (addressed by id).", no_args_is_help=True)
task_app = typer.Typer(help="Tasks (addressed by id).", no_args_is_help=True)
session_app = typer.Typer(help="Claude sessions from the journals.", no_args_is_help=True)
commit_app = typer.Typer(help="Commits of the project folders.", no_args_is_help=True)
db_app = typer.Typer(help="Database maintenance.", no_args_is_help=True)
app.add_typer(project_app, name="project")
app.add_typer(milestone_app, name="milestone")
app.add_typer(task_app, name="task")
app.add_typer(session_app, name="session")
app.add_typer(commit_app, name="commit")
app.add_typer(db_app, name="db")

EXIT_CODES: dict[type[OrbitError], tuple[int, str]] = {
    NotFoundError: (3, "not_found"),
    ConflictError: (4, "conflict"),
    ValidationError: (1, "validation"),
}

# --- shared options -----------------------------------------------------------

JsonOpt = Annotated[bool, typer.Option("--json", help="Print machine-readable JSON.")]
ForceOpt = Annotated[
    bool, typer.Option("--force", help="Allow closing/deleting with open children.")
]
StatusOpt = Annotated[
    str | None, typer.Option("--status", help=f"One of: {', '.join(s.value for s in Status)}.")
]
PriorityOpt = Annotated[
    str | None, typer.Option("--priority", help="0-4 or none/low/medium/high/urgent.")
]
StartOpt = Annotated[str | None, typer.Option("--start", help="Start date, YYYY-MM-DD.")]
DueOpt = Annotated[str | None, typer.Option("--due", help="Due date, YYYY-MM-DD.")]
SummaryOpt = Annotated[str | None, typer.Option("--summary", help="Up to 140 characters.")]
CommentOpt = Annotated[str | None, typer.Option("--comment", help="Up to 280 characters.")]

# --- plumbing -----------------------------------------------------------------


@dataclass(frozen=True)
class State:
    db: Path
    explicit: bool  # --db or ORBIT_DB was given


@app.callback()
def root(
    ctx: typer.Context,
    db: Annotated[
        Path | None,
        typer.Option("--db", envvar="ORBIT_DB", help="Database file (default: data/orbit.db)."),
    ] = None,
) -> None:
    """Orbit: projects, milestones and tasks with statuses and deadlines."""
    ctx.obj = State(db.expanduser().resolve() if db else DEFAULT_DB_PATH, explicit=db is not None)


@contextmanager
def open_orbit(path: Path) -> Iterator[Orbit]:
    """One command = one transaction: commit on success, roll back on any error."""
    actor = actor_from_env(os.environ)
    settings = load_settings(path, os.environ)
    engine = make_engine(path)
    try:
        ensure_schema(engine)
        with Session(engine) as session:
            yield Orbit(session, actor=actor, auto_dates=settings.auto_dates)
            session.commit()
    finally:
        engine.dispose()


def emit_json(data: Any) -> None:
    typer.echo(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def fail(exc: OrbitError, json_out: bool) -> None:
    code, kind = next(
        (value for cls, value in EXIT_CODES.items() if isinstance(exc, cls)), (1, "error")
    )
    if json_out:
        emit_json({"error": {"type": kind, "message": str(exc)}})
    else:
        typer.echo(f"error: {exc}", err=True)
    raise typer.Exit(code)


def execute(
    ctx: typer.Context,
    json_out: bool,
    action: Callable[[Orbit], Any],
    human: Callable[[Any], None],
) -> None:
    try:
        with open_orbit(ctx.obj.db) as orbit:
            data = action(orbit)
    except OrbitError as exc:
        fail(exc, json_out)
        return
    if json_out:
        emit_json(data)
    else:
        human(data)


def nullable(value: str) -> str | None:
    """'none' (or 'null', '-') on the command line clears a field."""
    return None if value.strip().lower() in {"none", "null", "-", ""} else value


def nullable_id(value: str) -> int | None:
    cleared = nullable(value)
    if cleared is None:
        return None
    try:
        return int(cleared)
    except ValueError:
        raise ValidationError(f"expected a numeric id or 'none', got '{value}'") from None


def parse_since(value: str, now: datetime) -> datetime:
    """'7d', '12h', '2w' or a date 'YYYY-MM-DD' (local midnight)."""
    match = re.fullmatch(r"(\d+)\s*([hdw])", value.strip().lower())
    if match:
        amount, unit = int(match[1]), match[2]
        delta = {"h": timedelta(hours=amount), "d": timedelta(days=amount)}.get(
            unit, timedelta(weeks=amount)
        )
        return now - delta
    try:
        day = date.fromisoformat(value.strip())
    except ValueError:
        raise ValidationError(f"invalid --since '{value}': use 7d, 12h, 2w or YYYY-MM-DD") from None
    return datetime.combine(day, time()).astimezone().astimezone(UTC)


# --- payloads (dicts shared by --json and human output) -----------------------


def history(orbit: Orbit, entity: Entity, entity_id: int) -> list[dict[str, Any]]:
    return [serialize.event(e) for e in orbit.events(entity=entity.value, entity_id=entity_id)]


def project_payload(orbit: Orbit, project: Project, with_history: bool = False) -> dict[str, Any]:
    [node] = orbit.tree(project.slug)
    data = serialize.row(project) | {"progress": node.progress, "overdue": node.overdue}
    if with_history:
        data["history"] = history(orbit, Entity.PROJECT, project.id)
    return data


def milestone_payload(
    orbit: Orbit, milestone: Milestone, with_history: bool = False
) -> dict[str, Any]:
    project = orbit.session.get(Project, milestone.project_id)
    assert project is not None
    [node] = orbit.tree(project.slug)
    m_node = next(m for m in node.milestones if m.milestone.id == milestone.id)
    data = serialize.row(milestone) | {
        "project": project.slug,
        "progress": m_node.progress,
        "overdue": m_node.overdue,
    }
    if with_history:
        data["history"] = history(orbit, Entity.MILESTONE, milestone.id)
    return data


def task_payload(orbit: Orbit, task: Task, with_history: bool = False) -> dict[str, Any]:
    project = orbit.session.get(Project, task.project_id)
    assert project is not None
    data = serialize.row(task) | {
        "project": project.slug,
        "overdue": is_overdue(task.due_date, Status(task.status), orbit.clock.today()),
    }
    if with_history:
        data["history"] = history(orbit, Entity.TASK, task.id)
    return data


# --- overview commands --------------------------------------------------------


@app.command()
def status(
    ctx: typer.Context,
    days: Annotated[int, typer.Option(help="Horizon for upcoming deadlines, days.")] = 7,
    json_out: JsonOpt = False,
) -> None:
    """In progress, blocked, overdue and upcoming deadlines."""
    execute(ctx, json_out, lambda o: serialize.report(o.status_report(days=days)), render.status)


@app.command()
def tree(
    ctx: typer.Context,
    project: Annotated[
        str | None, typer.Argument(help="Project slug; all projects if omitted.")
    ] = None,
    all_: Annotated[bool, typer.Option("--all", help="Include archived projects.")] = False,
    json_out: JsonOpt = False,
) -> None:
    """Project -> milestone -> task tree with progress and deadlines."""
    execute(
        ctx,
        json_out,
        lambda o: [serialize.project_node(n) for n in o.tree(project, include_archived=all_)],
        render.tree,
    )


@app.command()
def log(
    ctx: typer.Context,
    since: Annotated[str | None, typer.Option(help="7d, 12h, 2w or YYYY-MM-DD.")] = None,
    entity: Annotated[Entity | None, typer.Option(help="project, milestone or task.")] = None,
    id_: Annotated[int | None, typer.Option("--id", help="Entity id.")] = None,
    limit: Annotated[int, typer.Option(help="Show at most N latest events.")] = 50,
    json_out: JsonOpt = False,
) -> None:
    """Change history from the events journal."""

    def action(o: Orbit) -> list[dict[str, Any]]:
        start = parse_since(since, o.clock.now()) if since else None
        rows = o.events(since=start, entity=entity.value if entity else None, entity_id=id_)
        return [serialize.event(e) for e in rows[-limit:]]

    execute(ctx, json_out, action, render.events)


@app.command("undo")
def undo_command(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Take back the last action of the same actor (ORBIT_ACTOR), within 12 hours."""
    execute(ctx, json_out, lambda o: asdict(undo.undo(o)), render.undone)


@app.command("redo")
def redo_command(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Bring back what the last undo has taken."""
    execute(ctx, json_out, lambda o: asdict(undo.redo(o)), render.undone)


# --- projects -----------------------------------------------------------------


@project_app.command("add")
def project_add(
    ctx: typer.Context,
    slug: Annotated[str, typer.Argument(help="Unique id, = folder name in D:\\Projects.")],
    name: Annotated[str, typer.Option("--name", help="Display name.")],
    status: StatusOpt = None,
    priority: PriorityOpt = None,
    start: StartOpt = None,
    due: DueOpt = None,
    summary: SummaryOpt = None,
    obsidian: Annotated[str | None, typer.Option(help="Path inside the vault.")] = None,
    repo: Annotated[str | None, typer.Option(help="Local repository path.")] = None,
    github: Annotated[str | None, typer.Option(help="GitHub URL.")] = None,
    json_out: JsonOpt = False,
) -> None:
    """Add a project."""

    def action(o: Orbit) -> dict[str, Any]:
        p = o.add_project(
            slug,
            name=name,
            status=status or Status.BACKLOG,
            priority=priority or 0,
            start_date=start,
            due_date=due,
            summary=summary,
            obsidian_path=obsidian,
            repo_path=repo,
            github_url=github,
        )
        return project_payload(o, p)

    execute(ctx, json_out, action, render.project)


@project_app.command("list")
def project_list(
    ctx: typer.Context,
    all_: Annotated[bool, typer.Option("--all", help="Include archived projects.")] = False,
    json_out: JsonOpt = False,
) -> None:
    """List projects with progress."""

    def action(o: Orbit) -> list[dict[str, Any]]:
        return [
            serialize.row(n.project) | {"progress": n.progress, "overdue": n.overdue}
            for n in o.tree(include_archived=all_)
        ]

    execute(ctx, json_out, action, render.projects)


@project_app.command("show")
def project_show(ctx: typer.Context, slug: str, json_out: JsonOpt = False) -> None:
    """Show a project with its change history."""
    execute(ctx, json_out, lambda o: project_payload(o, o.get_project(slug), True), render.project)


@project_app.command("archive")
def project_archive(ctx: typer.Context, slug: str, json_out: JsonOpt = False) -> None:
    """Hide a project from default lists (reversible)."""
    execute(ctx, json_out, lambda o: project_payload(o, o.archive_project(slug)), render.project)


@project_app.command("unarchive")
def project_unarchive(ctx: typer.Context, slug: str, json_out: JsonOpt = False) -> None:
    """Bring an archived project back."""
    execute(ctx, json_out, lambda o: project_payload(o, o.unarchive_project(slug)), render.project)


# --- milestones ---------------------------------------------------------------


@milestone_app.command("add")
def milestone_add(
    ctx: typer.Context,
    project: Annotated[str, typer.Argument(help="Project slug.")],
    name: Annotated[str, typer.Argument(help="Milestone name.")],
    status: StatusOpt = None,
    start: StartOpt = None,
    due: DueOpt = None,
    summary: SummaryOpt = None,
    json_out: JsonOpt = False,
) -> None:
    """Add a milestone to a project."""

    def action(o: Orbit) -> dict[str, Any]:
        m = o.add_milestone(
            project,
            name,
            status=status or Status.PLANNED,
            start_date=start,
            due_date=due,
            summary=summary,
        )
        return milestone_payload(o, m)

    execute(ctx, json_out, action, render.milestone)


@milestone_app.command("list")
def milestone_list(
    ctx: typer.Context,
    project: Annotated[str, typer.Argument(help="Project slug.")],
    json_out: JsonOpt = False,
) -> None:
    """List milestones of a project with progress."""

    def action(o: Orbit) -> list[dict[str, Any]]:
        [node] = o.tree(project)
        return [
            serialize.row(m.milestone) | {"progress": m.progress, "overdue": m.overdue}
            for m in node.milestones
        ]

    execute(ctx, json_out, action, render.milestones)


@milestone_app.command("show")
def milestone_show(ctx: typer.Context, milestone_id: int, json_out: JsonOpt = False) -> None:
    """Show a milestone with its change history."""
    execute(
        ctx,
        json_out,
        lambda o: milestone_payload(o, o.get_milestone(milestone_id), True),
        render.milestone,
    )


@milestone_app.command("rm")
def milestone_rm(
    ctx: typer.Context, milestone_id: int, force: ForceOpt = False, json_out: JsonOpt = False
) -> None:
    """Delete a milestone (--force also deletes its tasks)."""

    def action(o: Orbit) -> dict[str, Any]:
        o.delete_milestone(milestone_id, force=force)
        return {"deleted": {"entity": "milestone", "id": milestone_id}}

    execute(ctx, json_out, action, render.deleted)


# --- tasks --------------------------------------------------------------------


@task_app.command("add")
def task_add(
    ctx: typer.Context,
    project: Annotated[str, typer.Argument(help="Project slug.")],
    title: Annotated[str, typer.Argument(help="Task title.")],
    milestone: Annotated[int | None, typer.Option(help="Milestone id.")] = None,
    parent: Annotated[int | None, typer.Option(help="Parent task id (subtask).")] = None,
    status: StatusOpt = None,
    priority: PriorityOpt = None,
    start: StartOpt = None,
    due: DueOpt = None,
    comment: CommentOpt = None,
    json_out: JsonOpt = False,
) -> None:
    """Add a task (optionally into a milestone or under a parent task)."""

    def action(o: Orbit) -> dict[str, Any]:
        t = o.add_task(
            project,
            title,
            milestone_id=milestone,
            parent_id=parent,
            status=status or Status.BACKLOG,
            priority=priority or 0,
            start_date=start,
            due_date=due,
            comment=comment,
        )
        return task_payload(o, t)

    execute(ctx, json_out, action, render.task)


@task_app.command("list")
def task_list(
    ctx: typer.Context,
    project: Annotated[str | None, typer.Argument(help="Project slug; all if omitted.")] = None,
    milestone: Annotated[int | None, typer.Option(help="Only this milestone.")] = None,
    status: Annotated[
        list[str] | None, typer.Option("--status", help="Filter by status (repeatable).")
    ] = None,
    open_: Annotated[bool, typer.Option("--open", help="Hide done and canceled.")] = False,
    json_out: JsonOpt = False,
) -> None:
    """List tasks."""

    def action(o: Orbit) -> list[dict[str, Any]]:
        rows = o.list_tasks(project, milestone, status)
        if open_:
            rows = [t for t in rows if Status(t.status) not in CLOSED_STATUSES]
        return [task_payload(o, t) for t in rows]

    execute(ctx, json_out, action, render.tasks)


@task_app.command("show")
def task_show(ctx: typer.Context, task_id: int, json_out: JsonOpt = False) -> None:
    """Show a task with its change history."""
    execute(ctx, json_out, lambda o: task_payload(o, o.get_task(task_id), True), render.task)


@task_app.command("rm")
def task_rm(
    ctx: typer.Context, task_id: int, force: ForceOpt = False, json_out: JsonOpt = False
) -> None:
    """Delete a task (--force also deletes its subtasks)."""

    def action(o: Orbit) -> dict[str, Any]:
        o.delete_task(task_id, force=force)
        return {"deleted": {"entity": "task", "id": task_id}}

    execute(ctx, json_out, action, render.deleted)


# --- set ----------------------------------------------------------------------


@app.command("set")
def set_(
    ctx: typer.Context,
    entity: Annotated[Entity, typer.Argument(help="project, milestone or task.")],
    ref: Annotated[str, typer.Argument(help="Project slug or milestone/task id.")],
    name: Annotated[str | None, typer.Option(help="Project/milestone name.")] = None,
    title: Annotated[str | None, typer.Option(help="Task title.")] = None,
    slug: Annotated[str | None, typer.Option(help="New project slug.")] = None,
    status: StatusOpt = None,
    priority: PriorityOpt = None,
    start: StartOpt = None,
    due: DueOpt = None,
    summary: SummaryOpt = None,
    comment: CommentOpt = None,
    obsidian: Annotated[str | None, typer.Option(help="Path inside the vault.")] = None,
    repo: Annotated[str | None, typer.Option(help="Local repository path.")] = None,
    github: Annotated[str | None, typer.Option(help="GitHub URL.")] = None,
    milestone: Annotated[
        str | None, typer.Option(help="Move task to milestone id, or none.")
    ] = None,
    parent: Annotated[str | None, typer.Option(help="Parent task id, or none.")] = None,
    position: Annotated[int | None, typer.Option(help="Sort position.")] = None,
    force: ForceOpt = False,
    json_out: JsonOpt = False,
) -> None:
    """Change fields. Pass 'none' to clear an optional field, e.g. --due none."""

    def action(o: Orbit) -> dict[str, Any]:
        text_options = {
            "name": name,
            "title": title,
            "slug": slug,
            "status": status,
            "priority": priority,
            "start_date": start,
            "due_date": due,
            "summary": summary,
            "comment": comment,
            "obsidian_path": obsidian,
            "repo_path": repo,
            "github_url": github,
        }
        changes: dict[str, Any] = {k: nullable(v) for k, v in text_options.items() if v is not None}
        if milestone is not None:
            changes["milestone_id"] = nullable_id(milestone)
        if parent is not None:
            changes["parent_id"] = nullable_id(parent)
        if position is not None:
            changes["position"] = position
        if not changes:
            raise ValidationError("nothing to change: pass at least one option, see --help")

        if entity is Entity.PROJECT:
            return project_payload(o, o.update_project(ref, force=force, **changes))
        item_id = nullable_id(ref)
        if item_id is None:
            raise ValidationError(f"{entity.value} id is required")
        if entity is Entity.MILESTONE:
            return milestone_payload(o, o.update_milestone(item_id, force=force, **changes))
        return task_payload(o, o.update_task(item_id, force=force, **changes))

    renderers: dict[Entity, Callable[[Any], None]] = {
        Entity.PROJECT: render.project,
        Entity.MILESTONE: render.milestone,
        Entity.TASK: render.task,
    }
    execute(ctx, json_out, action, renderers[entity])


# --- sessions -----------------------------------------------------------------


@session_app.command("import")
def session_import(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Read session journals from the Obsidian vault (orbit serve also does it itself)."""
    db: Path = ctx.obj.db

    def action(o: Orbit) -> dict[str, Any]:
        vault = load_settings(db, os.environ).vault
        if vault is None:
            raise ValidationError(
                f"no Obsidian vault: write vault = 'D:\\path\\to\\vault'"
                f" into {settings_file(db)} or set ORBIT_VAULT"
            )
        if not vault.is_dir():
            raise NotFoundError(f"vault {vault} not found")
        journal = read_journals(vault)
        result = o.import_sessions(journal.records)
        return asdict(result) | {"unreadable": journal.unreadable}

    execute(ctx, json_out, action, render.session_import)


@session_app.command("list")
def session_list(
    ctx: typer.Context,
    project: Annotated[str | None, typer.Argument(help="Project slug.")] = None,
    limit: Annotated[int, typer.Option(help="Show at most N latest sessions.")] = 20,
    json_out: JsonOpt = False,
) -> None:
    """Claude sessions, newest first."""

    def action(o: Orbit) -> list[dict[str, Any]]:
        slugs = {p.id: p.slug for p in o.list_projects(include_archived=True)}
        return [
            serialize.row(s) | {"project": slugs[s.project_id]}
            for s in o.sessions(project, limit=limit)
        ]

    execute(ctx, json_out, action, render.sessions)


# --- commits ------------------------------------------------------------------


@commit_app.command("import")
def commit_import(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Read commits from git of every project folder (orbit serve also does it itself)."""

    def action(o: Orbit) -> dict[str, Any]:
        done: dict[str, Any] = {}
        strange: list[str] = []
        for project in o.list_projects(include_archived=True):
            if project.repo_path is None:
                continue
            folder = local_folder(project.repo_path)
            commits = read_commits(folder) if folder else None
            if commits is None:
                strange.append(project.slug)
                continue
            records = [CommitRecord(sha, at) for sha, at in commits]
            done[project.slug] = asdict(o.import_commits(project.slug, records))
        return {"projects": done, "not_repositories": strange}

    execute(ctx, json_out, action, render.commit_import)


# --- server -------------------------------------------------------------------
# FastAPI is imported only here: every other command stays fast.


def run_server(app: Any, port: int, *, on_ready: Callable[[], object]) -> None:
    from orbit.api.server import run

    run(app, port, on_ready)


def running_orbit(port: int) -> str | None:
    """Database name of an orbit server on this port, None if something else answers."""
    connection = HTTPConnection("127.0.0.1", port, timeout=1)
    try:
        connection.request("GET", "/api/v1/meta")
        return str(json.loads(connection.getresponse().read())["database"]["name"])
    except (OSError, HTTPException, ValueError, KeyError, TypeError):
        return None
    finally:
        connection.close()


@app.command()
def serve(
    ctx: typer.Context,
    port: Annotated[int, typer.Option(help="Port on 127.0.0.1.")] = DEFAULT_PORT,
    open_: Annotated[
        bool, typer.Option("--open/--no-open", help="Open the interface in the browser.")
    ] = True,
) -> None:
    """API and interface on this computer only; stop with Ctrl+C."""
    from orbit.api.app import create_app
    from orbit.api.server import port_is_free

    db: Path = ctx.obj.db
    url = f"http://127.0.0.1:{port}"
    if not port_is_free(port):
        running = running_orbit(port)
        if running is None:
            typer.echo(f"error: port {port} is busy, choose another one: --port", err=True)
            raise typer.Exit(1)
        typer.echo(f"orbit is already running with {running}: {url}")
        if open_:
            webbrowser.open(url)
        return
    copied = auto_backup(db, date.today())
    if copied is not None:
        typer.echo(f"backup: {copied}")
    typer.echo(f"orbit with {db.name}: {url} (Ctrl+C to stop)")
    try:
        settings = load_settings(db, os.environ)
    except OrbitError as exc:
        fail(exc, json_out=False)
        return
    server = create_app(
        db, vault=settings.vault, auto_dates=settings.auto_dates, repos=not is_demo(db)
    )
    run_server(server, port, on_ready=lambda: open_ and webbrowser.open(url))


@app.command()
def openapi() -> None:
    """Print the API schema; the interface generates its types from it."""
    from orbit.api.app import create_app

    emit_json(create_app(DEFAULT_DB_PATH).openapi())


# --- maintenance --------------------------------------------------------------


@app.command()
def backup(
    ctx: typer.Context,
    dir_: Annotated[
        Path | None, typer.Option("--dir", help="Target folder (default: data/backups).")
    ] = None,
    json_out: JsonOpt = False,
) -> None:
    """Consistent copy of the database (SQLite backup API, safe while in use)."""
    source: Path = ctx.obj.db
    engine = make_engine(source)
    try:
        ensure_schema(engine)
    finally:
        engine.dispose()
    target_dir = dir_ or backup_dir(source)
    target = target_dir / f"{source.stem}-{datetime.now():%Y%m%d-%H%M%S}.db"
    copy_database(source, target)
    data = {"path": str(target), "bytes": target.stat().st_size}
    if json_out:
        emit_json(data)
    else:
        render.plain(data)


@db_app.command("info")
def db_info(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Database path, schema revision and row counts."""

    def action(o: Orbit) -> dict[str, Any]:
        engine = o.session.get_bind()
        counts = {
            model.__tablename__: o.session.scalar(select(func.count()).select_from(model)) or 0
            for model in (Project, Milestone, Task, Event, WorkSession, Commit)
        }
        vault = load_settings(ctx.obj.db, os.environ).vault
        return {
            "path": str(ctx.obj.db),
            "revision": current_revision(engine.engine),
            "head": head_revision(),
            "actor": o.actor.value,
            "vault": str(vault) if vault else None,
            **counts,
        }

    execute(ctx, json_out, action, render.plain)


@db_app.command("upgrade")
def db_upgrade(ctx: typer.Context, json_out: JsonOpt = False) -> None:
    """Apply pending migrations (orbit also does this automatically)."""
    execute(
        ctx,
        json_out,
        lambda o: {"path": str(ctx.obj.db), "revision": head_revision()},
        render.plain,
    )


@app.command()
def seed(
    ctx: typer.Context,
    demo: Annotated[bool, typer.Option("--demo", help="Fill with fictional demo data.")] = False,
    reset: Annotated[bool, typer.Option("--reset", help="Recreate the database first.")] = False,
    json_out: JsonOpt = False,
) -> None:
    """Demo data for screenshots (default target: data/demo.db, never data/orbit.db)."""
    state: State = ctx.obj
    target = state.db if state.explicit else DEMO_DB_PATH
    try:
        if not demo:
            raise ValidationError("only demo data is supported: orbit seed --demo")
        if target.resolve() == DEFAULT_DB_PATH.resolve():
            raise ValidationError(
                f"refusing to seed the real database {target}; pass --db with another file"
            )
        if reset:
            for suffix in ("", "-wal", "-shm"):
                Path(f"{target}{suffix}").unlink(missing_ok=True)
        engine = make_engine(target)
        try:
            ensure_schema(engine)
            with Session(engine) as session:
                if session.scalar(select(func.count()).select_from(Project)):
                    raise ConflictError(f"{target} is not empty; use --reset to recreate it")
                counts = seed_demo(session, today=date.today())
                session.commit()
        finally:
            engine.dispose()
    except OrbitError as exc:
        fail(exc, json_out)
        return
    data = {"path": str(target), **counts}
    if json_out:
        emit_json(data)
    else:
        render.plain(data)


@app.command()
def version(json_out: JsonOpt = False) -> None:
    """Print the orbit version."""
    if json_out:
        emit_json({"version": __version__})
    else:
        typer.echo(__version__)
