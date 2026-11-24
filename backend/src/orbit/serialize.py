"""Domain objects -> plain dicts. One shape for --json, human output and (later) the API."""

from dataclasses import asdict
from typing import Any

from orbit.db.models import Event, Milestone, Project, Task, WorkSession
from orbit.domain.service import MilestoneNode, ProjectNode, StatusReport, TaskNode, snapshot


def row(obj: Project | Milestone | Task | WorkSession) -> dict[str, Any]:
    return snapshot(obj)


def event(e: Event) -> dict[str, Any]:
    return snapshot(e)


def task_node(node: TaskNode) -> dict[str, Any]:
    return {
        "task": row(node.task),
        "overdue": node.overdue,
        "upcoming": node.upcoming,
        "signals": asdict(node.signals),
        "children": [task_node(c) for c in node.children],
    }


def milestone_node(node: MilestoneNode) -> dict[str, Any]:
    return {
        "milestone": row(node.milestone),
        "progress": node.progress,
        "overdue": node.overdue,
        "upcoming": node.upcoming,
        "signals": asdict(node.signals),
        "tasks": [task_node(t) for t in node.tasks],
    }


def project_node(node: ProjectNode) -> dict[str, Any]:
    return {
        "project": row(node.project),
        "progress": node.progress,
        "overdue": node.overdue,
        "upcoming": node.upcoming,
        "signals": asdict(node.signals),
        "focus": asdict(node.focus) if node.focus else None,
        "milestones": [milestone_node(m) for m in node.milestones],
        "tasks": [task_node(t) for t in node.tasks],
    }


def report(r: StatusReport) -> dict[str, Any]:
    data = asdict(r)
    data["today"] = r.today.isoformat()
    for section in ("in_progress", "blocked", "overdue", "upcoming"):
        for item in data[section]:
            if item["due_date"] is not None:
                item["due_date"] = item["due_date"].isoformat()
    return data
