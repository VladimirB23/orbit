import json
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner, Result

from orbit.cli import app


@pytest.fixture
def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "cli.db"))
    monkeypatch.setenv("ORBIT_ACTOR", "claude")
    runner = CliRunner()

    def invoke(*args: str) -> Result:
        return runner.invoke(app, list(args))

    return invoke


def as_json(result: Result) -> Any:
    assert result.exit_code == 0, result.output
    return json.loads(result.stdout)


def test_project_add_and_list(run: Any) -> None:
    created = as_json(
        run("project", "add", "orbit", "--name", "Orbit", "--due", "2026-12-20", "--json")
    )
    assert created["slug"] == "orbit"
    assert created["due_date"] == "2026-12-20"
    [listed] = as_json(run("project", "list", "--json"))
    assert listed["slug"] == "orbit"
    assert listed["progress"] == 0.0


def test_human_output_mentions_the_project(run: Any) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    result = run("project", "list")
    assert result.exit_code == 0
    assert "orbit" in result.output


def test_milestone_and_task_flow_with_set(run: Any) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    m = as_json(run("milestone", "add", "orbit", "Core and CLI", "--due", "2026-11-28", "--json"))
    t = as_json(run("task", "add", "orbit", "DB schema", "--milestone", str(m["id"]), "--json"))
    assert t["milestone_id"] == m["id"]

    done = as_json(
        run(
            "set",
            "task",
            str(t["id"]),
            "--status",
            "done",
            "--comment",
            "schema + migrations",
            "--json",
        )
    )
    assert done["status"] == "done"
    assert done["comment"] == "schema + migrations"
    assert done["done_at"] is not None


def test_set_none_clears_a_field(run: Any) -> None:
    run("project", "add", "a", "--name", "A", "--due", "2026-12-01")
    project = as_json(run("set", "project", "a", "--due", "none", "--json"))
    assert project["due_date"] is None


def test_tree_json_nests_items(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    run("milestone", "add", "a", "M")
    run("task", "add", "a", "T", "--milestone", "1")
    [node] = as_json(run("tree", "--json"))
    assert node["project"]["slug"] == "a"
    assert node["milestones"][0]["tasks"][0]["task"]["title"] == "T"


def test_status_json_has_sections(run: Any) -> None:
    run("project", "add", "a", "--name", "A", "--status", "in_progress")
    report = as_json(run("status", "--json"))
    assert set(report) >= {"today", "in_progress", "blocked", "overdue", "upcoming"}
    assert report["in_progress"][0]["title"] == "A"


def test_log_shows_actor_from_env(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    run("set", "project", "a", "--status", "planned")
    events = as_json(run("log", "--since", "7d", "--json"))
    assert [(e["action"], e["actor"]) for e in events] == [
        ("create", "claude"),
        ("update", "claude"),
    ]


def test_not_found_exits_3_with_json_error(run: Any) -> None:
    result = run("task", "show", "99", "--json")
    assert result.exit_code == 3
    assert json.loads(result.stdout)["error"]["type"] == "not_found"


def test_conflict_exits_4_and_force_overrides(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    run("milestone", "add", "a", "M")
    run("task", "add", "a", "T", "--milestone", "1")
    result = run("set", "milestone", "1", "--status", "done")
    assert result.exit_code == 4
    assert "--force" in result.output
    assert (
        as_json(run("set", "milestone", "1", "--status", "done", "--force", "--json"))["status"]
        == "done"
    )


def test_validation_error_exits_1(run: Any) -> None:
    result = run("project", "add", "Bad Slug", "--name", "X")
    assert result.exit_code == 1
    assert "slug" in result.output


def test_invalid_actor_is_rejected(run: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ORBIT_ACTOR", "bob")
    result = run("project", "add", "a", "--name", "A")
    assert result.exit_code == 1
    assert "ORBIT_ACTOR" in result.output


def test_failed_command_changes_nothing(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    run("set", "project", "a", "--name", "B", "--summary", "x" * 141)
    assert as_json(run("project", "show", "a", "--json"))["name"] == "A"


def test_task_rm_and_list(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    run("task", "add", "a", "T1")
    run("task", "add", "a", "T2")
    assert as_json(run("task", "rm", "1", "--json")) == {"deleted": {"entity": "task", "id": 1}}
    assert [t["title"] for t in as_json(run("task", "list", "a", "--json"))] == ["T2"]


def test_show_includes_history(run: Any) -> None:
    run("project", "add", "a", "--name", "A")
    shown = as_json(run("project", "show", "a", "--json"))
    assert shown["history"][0]["action"] == "create"


def test_backup_copies_the_database(run: Any, tmp_path: Path) -> None:
    run("project", "add", "a", "--name", "A")
    out = tmp_path / "backups"
    info = as_json(run("backup", "--dir", str(out), "--json"))
    assert Path(info["path"]).exists()
    assert Path(info["path"]).parent == out


def test_db_option_overrides_env(run: Any, tmp_path: Path) -> None:
    other = tmp_path / "other.db"
    run("--db", str(other), "project", "add", "a", "--name", "A")
    assert as_json(run("project", "list", "--json")) == []
    assert len(as_json(run("--db", str(other), "project", "list", "--json"))) == 1
