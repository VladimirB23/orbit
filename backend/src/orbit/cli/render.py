"""Human-readable output with rich. Input is always the same dicts that --json prints."""

from datetime import datetime
from typing import Any

from rich.console import Console
from rich.markup import escape
from rich.table import Table
from rich.tree import Tree

STATUS_STYLE = {
    "backlog": "dim",
    "planned": "cyan",
    "in_progress": "bold yellow",
    "paused": "magenta",
    "blocked": "bold red",
    "done": "green",
    "canceled": "dim strike",
}
PRIORITY_LABEL = {0: "", 1: "low", 2: "med", 3: "high", 4: "URGENT"}


def console() -> Console:
    # Created per call: tests swap sys.stdout, a module-level Console would keep the old one.
    return Console(highlight=False, soft_wrap=True)


def _status(value: str) -> str:
    return f"[{STATUS_STYLE.get(value, '')}]{value}[/]"


def _pct(value: float | None) -> str:
    return "" if value is None else f"{round(value * 100)}%"


def _due(item: dict[str, Any], overdue: bool = False) -> str:
    due = item.get("due_date")
    if not due:
        return ""
    return f"[bold red]{due} overdue[/]" if overdue else f"due {due}"


def _local(ts: str | None) -> str:
    if not ts:
        return ""
    return datetime.fromisoformat(ts).astimezone().strftime("%Y-%m-%d %H:%M")


def _join(*parts: str) -> str:
    return "  ".join(p for p in parts if p)


# --- single items -------------------------------------------------------------


def item(data: dict[str, Any], title: str) -> None:
    out = console()
    table = Table(title=title, show_header=False, box=None, pad_edge=False)
    table.add_column(style="bold")
    table.add_column()
    for key, value in data.items():
        if key == "history":
            continue
        if key == "status":
            table.add_row(key, _status(str(value)))
        elif key == "progress":
            table.add_row(key, _pct(value))
        elif key.endswith("_at"):
            table.add_row(key, _local(value))
        else:
            table.add_row(key, "" if value is None else escape(str(value)))
    out.print(table)
    if data.get("history"):
        out.print()
        events(data["history"], title="history")


def project(data: dict[str, Any]) -> None:
    item(data, f"project {data['slug']}")


def milestone(data: dict[str, Any]) -> None:
    item(data, f"milestone #{data['id']}")


def task(data: dict[str, Any]) -> None:
    item(data, f"task #{data['id']}")


def deleted(data: dict[str, Any]) -> None:
    d = data["deleted"]
    console().print(f"deleted {d['entity']} #{d['id']}")


def undone(data: dict[str, Any]) -> None:
    what = ", ".join(data["fields"]) or data["action"]
    more = f" and {data['count'] - 1} more inside" if data["count"] > 1 else ""
    title = escape(data["title"])
    console().print(f"taken back: {what} of {data['entity']} #{data['id']} {title}{more}")


# --- lists --------------------------------------------------------------------


def projects(rows: list[dict[str, Any]]) -> None:
    out = console()
    if not rows:
        out.print("no projects")
        return
    table = Table("slug", "name", "status", "progress", "due", "summary")
    for p in rows:
        archived = " [dim](archived)[/]" if p.get("archived_at") else ""
        table.add_row(
            p["slug"] + archived,
            escape(p["name"]),
            _status(p["status"]),
            _pct(p.get("progress")),
            _due(p, p.get("overdue", False)),
            escape(p.get("summary") or ""),
        )
    out.print(table)


def milestones(rows: list[dict[str, Any]]) -> None:
    out = console()
    if not rows:
        out.print("no milestones")
        return
    table = Table("id", "name", "status", "progress", "due", "summary")
    for m in rows:
        table.add_row(
            str(m["id"]),
            escape(m["name"]),
            _status(m["status"]),
            _pct(m.get("progress")),
            _due(m, m.get("overdue", False)),
            escape(m.get("summary") or ""),
        )
    out.print(table)


def tasks(rows: list[dict[str, Any]]) -> None:
    out = console()
    if not rows:
        out.print("no tasks")
        return
    table = Table("id", "project", "ms", "title", "status", "prio", "due", "comment")
    for t in rows:
        table.add_row(
            str(t["id"]),
            t.get("project", ""),
            "" if t["milestone_id"] is None else str(t["milestone_id"]),
            ("  " if t["parent_id"] else "") + escape(t["title"]),
            _status(t["status"]),
            PRIORITY_LABEL.get(t["priority"], ""),
            _due(t, t.get("overdue", False)),
            escape(t.get("comment") or ""),
        )
    out.print(table)


def events(rows: list[dict[str, Any]], title: str | None = None) -> None:
    out = console()
    if not rows:
        out.print("no events")
        return
    table = Table("at", "actor", "entity", "action", "field", "old", "new", title=title)
    for e in rows:
        is_snapshot = e["action"] in ("create", "delete")
        table.add_row(
            _local(e["at"]),
            e["actor"],
            f"{e['entity']} #{e['entity_id']}",
            e["action"],
            e["field"] or "",
            "" if is_snapshot else escape(e["old_value"] or ""),
            "" if is_snapshot else escape(e["new_value"] or ""),
        )
    out.print(table)


def sessions(rows: list[dict[str, Any]]) -> None:
    out = console()
    if not rows:
        out.print("no sessions")
        return
    table = Table("started", "project", "title", "prompts", "files", "commits")
    for s in rows:
        table.add_row(
            _local(s["started_at"]),
            s["project"],
            escape(s["title"]),
            str(s["prompts"]),
            str(s["files"]),
            str(s["commits"]),
        )
    out.print(table)


def commit_import(data: dict[str, Any]) -> None:
    out = console()
    for slug, done in data["projects"].items():
        total = done["added"] + done["unchanged"]
        out.print(f"{slug}: {total} commits, {done['added']} new, {done['removed']} gone")
    if data["not_repositories"]:
        out.print(f"not git repositories: {', '.join(data['not_repositories'])}")


def session_import(data: dict[str, Any]) -> None:
    out = console()
    out.print(f"added {data['added']}, updated {data['updated']}, unchanged {data['unchanged']}")
    for slug, count in data["unknown_projects"].items():
        out.print(f"skipped {count}: no project '{escape(slug)}' in orbit")
    if data["unreadable"]:
        out.print(f"skipped {data['unreadable']}: entry not understood")


# --- tree and status ----------------------------------------------------------


def _task_branch(parent: Tree, node: dict[str, Any]) -> None:
    t = node["task"]
    label = _join(
        f"[dim]#{t['id']}[/]",
        escape(t["title"]),
        _status(t["status"]),
        _due(t, node["overdue"]),
        f"[italic]{escape(t['comment'])}[/]" if t.get("comment") else "",
    )
    branch = parent.add(label)
    for child in node["children"]:
        _task_branch(branch, child)


def tree(nodes: list[dict[str, Any]]) -> None:
    out = console()
    if not nodes:
        out.print("no projects")
        return
    for node in nodes:
        p = node["project"]
        root = Tree(
            _join(
                f"[bold]{escape(p['name'])}[/] [dim]({p['slug']})[/]",
                _status(p["status"]),
                _pct(node["progress"]),
                _due(p, node["overdue"]),
                f"[italic]{escape(p['summary'])}[/]" if p.get("summary") else "",
            )
        )
        for m_node in node["milestones"]:
            m = m_node["milestone"]
            branch = root.add(
                _join(
                    f"[dim]#{m['id']}[/]",
                    f"[bold]{escape(m['name'])}[/]",
                    _status(m["status"]),
                    _pct(m_node["progress"]),
                    _due(m, m_node["overdue"]),
                    f"[italic]{escape(m['summary'])}[/]" if m.get("summary") else "",
                )
            )
            for t_node in m_node["tasks"]:
                _task_branch(branch, t_node)
        for t_node in node["tasks"]:
            _task_branch(root, t_node)
        out.print(root)


def status(data: dict[str, Any]) -> None:
    out = console()
    out.print(f"[bold]orbit status[/] for {data['today']}")
    sections = [
        ("in_progress", "In progress"),
        ("blocked", "Blocked"),
        ("overdue", "Overdue"),
        ("upcoming", "Upcoming deadlines"),
    ]
    for key, title in sections:
        rows = data[key]
        if not rows:
            continue
        table = Table("project", "entity", "id", "title", "status", "due", title=title)
        for r in rows:
            table.add_row(
                r["project"],
                r["entity"],
                str(r["id"]),
                escape(r["title"]),
                _status(r["status"]),
                r["due_date"] or "",
            )
        out.print(table)
    if not any(data[key] for key, _ in sections):
        out.print("nothing in progress, blocked, overdue or due soon")


def plain(data: dict[str, Any]) -> None:
    out = console()
    for key, value in data.items():
        out.print(f"[bold]{key}[/]: {escape(str(value))}")
