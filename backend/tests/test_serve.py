"""Serving the built UI, automatic backups and the `orbit serve` command."""

import socket
import sqlite3
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from typer.testing import CliRunner

from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.db.backup import AUTO_KEEP, auto_backup, copy_database
from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit

BASE = "http://localhost:8420"
DAY = date(2026, 11, 24)


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<title>Orbit</title>", encoding="utf-8")
    (root / "assets" / "app-123.js").write_text("export {}", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")
    return root


@pytest.fixture
def client(db_file: Path, dist: Path) -> Iterator[TestClient]:
    with TestClient(create_app(db_file, ui=dist), base_url=BASE) as client:
        yield client


@pytest.fixture
def filled_db(db_file: Path) -> Path:
    engine = make_engine(db_file)
    ensure_schema(engine)
    with Session(engine) as session:
        Orbit(session, actor=Actor.CLAUDE).add_project("a", name="A")
        session.commit()
    engine.dispose()
    return db_file


# --- static files -------------------------------------------------------------


def test_root_serves_the_ui_and_is_never_cached(client: TestClient) -> None:
    response = client.get("/")
    assert "<title>Orbit</title>" in response.text
    assert response.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_cached_forever(client: TestClient) -> None:
    response = client.get("/assets/app-123.js")
    assert "javascript" in response.headers["content-type"]
    assert "immutable" in response.headers["cache-control"]


def test_unknown_page_opens_the_ui_so_links_survive_reload(client: TestClient) -> None:
    assert "<title>Orbit</title>" in client.get("/timeline").text


def test_missing_asset_is_404_not_the_page(client: TestClient) -> None:
    assert client.get("/assets/gone.js").status_code == 404


@pytest.mark.parametrize("path", ["/../secret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt"])
def test_files_outside_the_build_are_unreachable(client: TestClient, path: str) -> None:
    assert "secret" not in client.get(path).text


def test_without_a_build_the_page_tells_what_to_run(db_file: Path, tmp_path: Path) -> None:
    app = create_app(db_file, ui=tmp_path / "nothing")
    with TestClient(app, base_url=BASE) as client:
        response = client.get("/")
        assert response.status_code == 503
        assert "npm run build" in response.text
        assert client.get("/api/v1/meta").status_code == 200


# --- backups ------------------------------------------------------------------


def test_copy_is_a_complete_database(filled_db: Path, tmp_path: Path) -> None:
    target = tmp_path / "copy.db"
    copy_database(filled_db, target)
    connection = sqlite3.connect(target)
    try:
        assert connection.execute("select slug from projects").fetchall() == [("a",)]
    finally:
        connection.close()


def test_auto_backup_runs_once_a_day(filled_db: Path) -> None:
    first = auto_backup(filled_db, DAY)
    assert first is not None
    assert first.exists()
    assert auto_backup(filled_db, DAY) is None
    assert auto_backup(filled_db, DAY + timedelta(days=1)) is not None


def test_auto_backup_keeps_the_latest_and_never_touches_manual_copies(filled_db: Path) -> None:
    folder = filled_db.parent / "backups"
    folder.mkdir()
    manual = folder / "orbit-20200101-000000.db"
    manual.write_bytes(b"manual")
    for n in range(AUTO_KEEP + 3):
        auto_backup(filled_db, DAY + timedelta(days=n))
    autos = sorted(p.name for p in folder.glob("orbit-auto-*.db"))
    assert len(autos) == AUTO_KEEP
    assert autos[0] == f"orbit-auto-{DAY + timedelta(days=3):%Y%m%d}.db"
    assert manual.exists()


def test_nothing_to_back_up_before_the_first_run(db_file: Path) -> None:
    assert auto_backup(db_file, DAY) is None
    assert not (db_file.parent / "backups").exists()


def test_interrupted_backup_is_not_taken_for_a_good_one(
    filled_db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def crash(_source: Path, target: Path) -> None:
        target.write_bytes(b"half")
        raise OSError("disk is full")

    with monkeypatch.context() as patch:
        patch.setattr("orbit.db.backup.copy_database", crash)
        with pytest.raises(OSError, match="disk is full"):
            auto_backup(filled_db, DAY)
    assert auto_backup(filled_db, DAY) is not None


# --- command ------------------------------------------------------------------


@pytest.fixture
def started(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Replaces the blocking server; records the port it was asked to listen on."""
    ports: list[int] = []

    def fake(_app: object, port: int, *, on_ready: object, mark: Path) -> None:
        ports.append(port)

    monkeypatch.setattr("orbit.cli.commands.run_server", fake)
    return ports


def test_serve_backs_up_the_database_and_starts(
    filled_db: Path, started: list[int], monkeypatch: pytest.MonkeyPatch
) -> None:
    # The real orbit may be running on the default port right now.
    monkeypatch.setattr("orbit.cli.commands.port_is_free", lambda _port: True)
    result = CliRunner().invoke(cli, ["--db", str(filled_db), "serve", "--no-open"])
    assert result.exit_code == 0, result.output
    assert "http://127.0.0.1:8420" in result.output
    assert started == [8420]
    assert list((filled_db.parent / "backups").glob("*-auto-*.db"))


def test_serve_reports_a_busy_port(filled_db: Path, started: list[int]) -> None:
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        result = CliRunner().invoke(
            cli, ["--db", str(filled_db), "serve", "--no-open", "--port", str(port)]
        )
    assert result.exit_code == 1
    assert str(port) in result.output
    assert started == []


def test_openapi_command_prints_the_schema() -> None:
    result = CliRunner().invoke(cli, ["openapi"])
    assert result.exit_code == 0
    assert '"/api/v1/tree"' in result.output
