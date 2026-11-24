"""HTTP contract of /api/v1: same domain rules as the CLI, signed by Vladimir."""

from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from orbit.api.app import create_app
from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from tests.conftest import TODAY, FakeClock

BASE = "http://localhost:8420"


@pytest.fixture
def client(db_file: Path, clock: FakeClock) -> Iterator[TestClient]:
    app = create_app(db_file, clock=clock)
    with TestClient(app, base_url=BASE) as client:
        yield client


@pytest.fixture
def project(client: TestClient) -> dict[str, Any]:
    return post(client, "/api/v1/projects", {"slug": "a", "name": "A"})


def post(client: TestClient, url: str, body: dict[str, Any]) -> dict[str, Any]:
    response = client.post(url, json=body)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()
    return data


def error(response: Any) -> dict[str, str]:
    data: dict[str, str] = response.json()["error"]
    return data


# --- tree ---------------------------------------------------------------------


def test_tree_returns_nested_projects_with_flags(client: TestClient) -> None:
    due = (TODAY + timedelta(days=2)).isoformat()
    post(client, "/api/v1/projects", {"slug": "a", "name": "A"})
    m = post(
        client,
        "/api/v1/projects/a/milestones",
        {"name": "M", "status": "in_progress", "due_date": due},
    )
    t = post(client, "/api/v1/projects/a/tasks", {"title": "T", "milestone_id": m["id"]})
    post(client, "/api/v1/projects/a/tasks", {"title": "Sub", "parent_id": t["id"]})

    data = client.get("/api/v1/tree").json()

    assert data["today"] == TODAY.isoformat()
    [node] = data["projects"]
    assert node["project"]["slug"] == "a"
    assert node["focus"] == {
        "entity": "milestone",
        "id": m["id"],
        "title": "M",
        "kind": "current",
    }
    assert node["signals"] == {"in_progress": 1, "blocked": 0, "overdue": 0, "upcoming": 1}
    assert node["milestones"][0]["actual"] == {"start": TODAY.isoformat(), "end": None}
    [milestone] = node["milestones"]
    assert milestone["upcoming"] is True
    [task] = milestone["tasks"]
    assert task["task"]["title"] == "T"
    assert task["children"][0]["task"]["title"] == "Sub"


def test_tree_hides_archived_projects_by_default(
    client: TestClient, project: dict[str, Any]
) -> None:
    assert client.post("/api/v1/projects/a/archive").json()["archived_at"] is not None
    assert client.get("/api/v1/tree").json()["projects"] == []
    assert len(client.get("/api/v1/tree?archived=true").json()["projects"]) == 1
    assert client.post("/api/v1/projects/a/unarchive").json()["archived_at"] is None


# --- edits --------------------------------------------------------------------


def test_patch_changes_only_the_sent_fields(client: TestClient, project: dict[str, Any]) -> None:
    t = post(client, "/api/v1/projects/a/tasks", {"title": "T", "comment": "keep", "priority": 2})
    response = client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "in_progress"})
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["comment"] == "keep"
    assert response.json()["priority"] == 2


def test_patch_null_clears_an_optional_field(client: TestClient, project: dict[str, Any]) -> None:
    t = post(client, "/api/v1/projects/a/tasks", {"title": "T", "due_date": "2026-12-01"})
    response = client.patch(f"/api/v1/tasks/{t['id']}", json={"due_date": None})
    assert response.json()["due_date"] is None


@pytest.mark.parametrize("field", ["title", "status", "priority", "position"])
def test_patch_null_on_a_required_field_is_a_validation_error(
    client: TestClient, project: dict[str, Any], field: str
) -> None:
    t = post(client, "/api/v1/projects/a/tasks", {"title": "T"})
    response = client.patch(f"/api/v1/tasks/{t['id']}", json={field: None})
    assert response.status_code == 422
    assert error(response)["type"] == "validation"


def test_patch_project_and_milestone(client: TestClient, project: dict[str, Any]) -> None:
    m = post(client, "/api/v1/projects/a/milestones", {"name": "M"})
    renamed = client.patch(f"/api/v1/milestones/{m['id']}", json={"name": "M2", "summary": "s"})
    assert (renamed.json()["name"], renamed.json()["summary"]) == ("M2", "s")
    moved = client.patch("/api/v1/projects/a", json={"slug": "b", "github_url": "https://x.y/z"})
    assert moved.json()["slug"] == "b"
    assert client.get("/api/v1/tree").json()["projects"][0]["project"]["slug"] == "b"


def test_unknown_field_is_rejected(client: TestClient, project: dict[str, Any]) -> None:
    response = client.patch("/api/v1/projects/a", json={"nmae": "typo"})
    assert response.status_code == 422
    assert "nmae" in error(response)["message"]


def test_delete_task_and_milestone(client: TestClient, project: dict[str, Any]) -> None:
    m = post(client, "/api/v1/projects/a/milestones", {"name": "M"})
    t = post(client, "/api/v1/projects/a/tasks", {"title": "T"})
    assert client.delete(f"/api/v1/tasks/{t['id']}").status_code == 204
    assert client.delete(f"/api/v1/milestones/{m['id']}").status_code == 204
    [node] = client.get("/api/v1/tree").json()["projects"]
    assert node["milestones"] == node["tasks"] == []


# --- errors -------------------------------------------------------------------


def test_missing_items_return_404(client: TestClient) -> None:
    for url in ("/api/v1/projects/nope", "/api/v1/milestones/1", "/api/v1/tasks/1"):
        response = client.patch(url, json={"status": "done"})
        assert response.status_code == 404
        assert error(response)["type"] == "not_found"


def test_domain_rule_violation_returns_422(client: TestClient, project: dict[str, Any]) -> None:
    response = client.patch("/api/v1/projects/a", json={"summary": "x" * 141})
    assert response.status_code == 422
    assert error(response)["type"] == "validation"
    assert "140" in error(response)["message"]


def test_malformed_input_uses_the_same_error_shape(
    client: TestClient, project: dict[str, Any]
) -> None:
    response = client.patch("/api/v1/projects/a", json={"due_date": "tomorrow"})
    assert response.status_code == 422
    assert error(response)["type"] == "validation"
    assert "due_date" in error(response)["message"]


def test_closing_with_open_children_needs_force(
    client: TestClient, project: dict[str, Any]
) -> None:
    m = post(client, "/api/v1/projects/a/milestones", {"name": "M"})
    post(client, "/api/v1/projects/a/tasks", {"title": "T", "milestone_id": m["id"]})
    url = f"/api/v1/milestones/{m['id']}"

    refused = client.patch(url, json={"status": "done"})
    assert refused.status_code == 409
    assert error(refused)["type"] == "conflict"
    assert client.patch(f"{url}?force=true", json={"status": "done"}).status_code == 200

    assert client.delete(url).status_code == 409
    assert client.delete(f"{url}?force=true").status_code == 204


def test_failed_request_leaves_no_trace(client: TestClient, project: dict[str, Any]) -> None:
    before = len(client.get("/api/v1/events").json())
    client.patch("/api/v1/projects/a", json={"name": "New", "summary": "x" * 141})
    assert len(client.get("/api/v1/events").json()) == before
    assert client.get("/api/v1/tree").json()["projects"][0]["project"]["name"] == "A"


def test_failed_commit_is_not_reported_as_success(
    client: TestClient, project: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.exc import OperationalError

    def locked(self: Session) -> None:
        raise OperationalError("COMMIT", {}, Exception("database is locked"))

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", locked)
        response = client.patch("/api/v1/projects/a", json={"name": "New"})
    assert response.status_code == 503
    assert error(response)["type"] == "unavailable"
    assert client.get("/api/v1/tree").json()["projects"][0]["project"]["name"] == "A"


def test_unknown_api_path_is_json_404(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert error(response)["type"] == "not_found"


# --- journal ------------------------------------------------------------------


def test_ui_edits_are_signed_by_vladimir_even_in_a_claude_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ORBIT_ACTOR", "claude")
    post(client, "/api/v1/projects", {"slug": "a", "name": "A"})
    assert [e["actor"] for e in client.get("/api/v1/events").json()] == ["vladimir"]


def test_events_of_one_item_come_newest_first_with_limit(
    client: TestClient, project: dict[str, Any]
) -> None:
    for name in ("B", "C", "D"):
        client.patch("/api/v1/projects/a", json={"name": name})
    post(client, "/api/v1/projects", {"slug": "other", "name": "Other"})
    events = client.get(
        "/api/v1/events", params={"entity": "project", "id": project["id"], "limit": 2}
    ).json()
    assert [(e["field"], e["new_value"]) for e in events] == [("name", "D"), ("name", "C")]


def test_cli_and_api_share_one_database(client: TestClient, db_file: Path) -> None:
    engine = make_engine(db_file)
    ensure_schema(engine)
    with Session(engine) as session:
        Orbit(session, actor=Actor.CLAUDE).add_project("cli", name="From CLI")
        session.commit()
    engine.dispose()
    assert client.get("/api/v1/tree").json()["projects"][0]["project"]["slug"] == "cli"
    assert client.get("/api/v1/events").json()[0]["actor"] == "claude"


# --- meta ---------------------------------------------------------------------


def test_meta_tells_the_ui_limits_and_database(client: TestClient) -> None:
    meta = client.get("/api/v1/meta").json()
    assert meta["limits"] == {"name": 200, "title": 300, "summary": 140, "comment": 280}
    assert meta["upcoming_days"] == 7
    assert meta["database"] == {"name": "orbit.db", "demo": False}


def test_meta_marks_the_demo_database(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "demo.db"), base_url=BASE) as client:
        assert client.get("/api/v1/meta").json()["database"] == {"name": "demo.db", "demo": True}
