"""The journals reach the database by themselves: in the server and by command."""

import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session
from typer.testing import CliRunner, Result

from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from orbit.sync import JournalSync
from tests.test_journal import ENTRY_A, ENTRY_B, ID_A, journal

BASE = "http://localhost:8420"


def write(vault: Path, project: str, *entries: str) -> Path:
    path = vault / "Inbox" / project / "Журнал сессий.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(journal(*entries), encoding="utf-8")
    return path


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    root = tmp_path / "My vault"
    write(root, "orbit", ENTRY_A)
    return root


def add_project(engine: Engine, slug: str) -> None:
    with Session(engine) as session:
        Orbit(session, actor=Actor.CLAUDE).add_project(slug, name=slug)
        session.commit()


def titles(engine: Engine) -> list[str]:
    with Session(engine) as session:
        return [s.title for s in Orbit(session, actor=Actor.SYSTEM).sessions()]


# --- sync ---------------------------------------------------------------------


def test_first_run_imports(engine: Engine, vault: Path) -> None:
    add_project(engine, "orbit")
    JournalSync(engine, vault).sync()
    assert titles(engine) == ["Этап 2 проекта на FastAPI"]


def test_nothing_is_read_again_until_a_journal_changes(engine: Engine, vault: Path) -> None:
    add_project(engine, "orbit")
    sync = JournalSync(engine, vault)
    assert sync.sync() is not None
    assert sync.sync() is None
    write(vault, "orbit", ENTRY_A, ENTRY_B)
    again = sync.sync()
    assert again is not None and again.added == 1


def test_new_project_receives_its_old_sessions(engine: Engine, vault: Path) -> None:
    sync = JournalSync(engine, vault)
    first = sync.sync()
    assert first is not None and first.unknown_projects == {"orbit": 1}
    add_project(engine, "orbit")
    second = sync.sync()
    assert second is not None and second.added == 1


def test_unreadable_file_is_tried_again(engine: Engine, vault: Path) -> None:
    add_project(engine, "orbit")
    path = vault / "Inbox" / "orbit" / "Журнал сессий.md"
    path.write_bytes(b"\xff\xfe broken")
    sync = JournalSync(engine, vault)
    with pytest.raises(ValueError):
        sync.sync()
    write(vault, "orbit", ENTRY_A)
    assert sync.sync() is not None
    assert len(titles(engine)) == 1


# --- server -------------------------------------------------------------------


@pytest.fixture
def filled_db(db_file: Path) -> Path:
    engine = make_engine(db_file)
    ensure_schema(engine)
    add_project(engine, "orbit")
    engine.dispose()
    return db_file


@pytest.fixture
def client(filled_db: Path, vault: Path) -> Iterator[TestClient]:
    with TestClient(create_app(filled_db, vault=vault), base_url=BASE) as client:
        yield client


def wait_for_sessions(client: TestClient) -> list[dict[str, Any]]:
    for _ in range(50):
        rows: list[dict[str, Any]] = client.get("/api/v1/sessions?project=orbit").json()
        if rows:
            return rows
        time.sleep(0.05)
    raise AssertionError("sessions were not imported")


def test_server_imports_on_start_and_lists_sessions(client: TestClient) -> None:
    [row] = wait_for_sessions(client)
    assert row["external_id"] == ID_A
    assert row["title"] == "Этап 2 проекта на FastAPI"
    assert (row["prompts"], row["files"], row["commits"]) == (11, 24, 6)
    assert row["folder"] == "d:\\Projects\\orbit"


def test_sessions_of_an_unknown_project_are_not_found(client: TestClient) -> None:
    assert client.get("/api/v1/sessions?project=nope").status_code == 404


def test_meta_names_the_vault_but_not_its_path(client: TestClient, vault: Path) -> None:
    meta = client.get("/api/v1/meta")
    assert meta.json()["vault"] == "My vault"
    assert json.dumps(str(vault.parent)).strip('"') not in meta.text


def test_without_a_vault_the_server_works_as_before(filled_db: Path) -> None:
    with TestClient(create_app(filled_db), base_url=BASE) as client:
        assert client.get("/api/v1/meta").json()["vault"] is None
        assert client.get("/api/v1/sessions").json() == []


def test_broken_journal_does_not_stop_the_server(filled_db: Path, vault: Path) -> None:
    (vault / "Inbox" / "orbit" / "Журнал сессий.md").write_bytes(b"\xff\xfe broken")
    with TestClient(create_app(filled_db, vault=vault), base_url=BASE) as client:
        time.sleep(0.2)
        assert client.get("/api/v1/tree").status_code == 200


# --- CLI ----------------------------------------------------------------------


@pytest.fixture
def run(tmp_path: Path, vault: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "cli.db"))
    monkeypatch.setenv("ORBIT_VAULT", str(vault))
    runner = CliRunner()

    def invoke(*args: str) -> Result:
        return runner.invoke(cli, list(args))

    return invoke


def as_json(result: Result) -> Any:
    assert result.exit_code == 0, result.output
    return json.loads(result.stdout)


def test_import_command_reports_what_happened(run: Any, vault: Path) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    write(vault, "Garden", ENTRY_B)
    report = as_json(run("session", "import", "--json"))
    assert report["added"] == 1
    assert report["unknown_projects"] == {"garden": 1}
    assert report["unreadable"] == 0


def test_list_command_shows_sessions_of_a_project(run: Any) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    run("session", "import")
    [row] = as_json(run("session", "list", "orbit", "--json"))
    assert row["title"] == "Этап 2 проекта на FastAPI"
    assert row["project"] == "orbit"
    human = run("session", "list")
    assert human.exit_code == 0
    assert "Этап 2" in human.output


def test_list_survives_markup_in_a_title(run: Any, vault: Path) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    write(vault, "orbit", ENTRY_A.replace("Этап 2 проекта на FastAPI", "[/bold] fix"))
    run("session", "import")
    result = run("session", "list")
    assert result.exit_code == 0, result.output
    assert "[/bold] fix" in result.output


def test_import_without_a_vault_says_how_to_set_it(
    run: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("ORBIT_VAULT")
    result = run("session", "import")
    assert result.exit_code == 1
    assert "cli.toml" in result.output


def test_import_from_a_missing_vault_is_an_error(
    run: Any, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ORBIT_VAULT", str(tmp_path / "gone"))
    result = run("session", "import")
    assert result.exit_code == 3
    assert "gone" in result.output


def test_db_info_shows_the_vault(run: Any, vault: Path) -> None:
    info = as_json(run("db", "info", "--json"))
    assert info["vault"] == str(vault)
    assert info["sessions"] == 0


def test_about_command_says_what_a_session_was_about(run: Any) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    run("project", "add", "bot", "--name", "Bot")
    run("session", "import")
    row = as_json(run("session", "about", ID_A[:8], "bot", "--json"))
    assert (row["project"], row["about"]) == ("orbit", "bot")
    assert [s["title"] for s in as_json(run("session", "list", "bot", "--json"))] == [row["title"]]
    assert "about bot" in run("session", "list").output
    assert as_json(run("session", "about", ID_A, "none", "--json"))["about"] is None


def test_import_names_the_projects_that_have_begun(run: Any) -> None:
    run("project", "add", "orbit", "--name", "Orbit")
    result = run("session", "import")
    assert "orbit: its folder is known now" in result.output
    assert as_json(run("project", "show", "orbit", "--json"))["repo_path"] == r"D:\Projects\orbit"


def test_the_screen_can_say_it_too(client: TestClient) -> None:
    wait_for_sessions(client)
    client.post("/api/v1/projects", json={"slug": "bot", "name": "Bot"})
    url = f"/api/v1/sessions/{ID_A}"
    row = client.patch(url, json={"topic": "bot"}).json()
    assert row["topic_id"] is not None
    assert client.get("/api/v1/sessions?project=bot").json() == [row]
    assert client.patch(url, json={"topic": None}).json()["topic_id"] is None
    assert client.patch(url, json={"topic": "nope"}).status_code == 404
    assert client.patch("/api/v1/sessions/ffffffff", json={"topic": "bot"}).status_code == 404


def test_the_tree_marks_future_projects(client: TestClient) -> None:
    wait_for_sessions(client)
    client.post("/api/v1/projects", json={"slug": "bot", "name": "Bot"})
    nodes = client.get("/api/v1/tree").json()["projects"]
    assert {n["project"]["slug"]: n["future"] for n in nodes} == {"orbit": False, "bot": True}
