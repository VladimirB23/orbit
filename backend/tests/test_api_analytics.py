"""Analytics from outside: the endpoint and the command."""

import json
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from typer.testing import CliRunner, Result

from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.db.engine import ensure_schema, make_engine
from orbit.seed import seed_demo
from tests.conftest import TODAY, FakeClock

URL = "/api/v1/analytics"


@pytest.fixture
def client(db_file: Path, clock: FakeClock) -> Iterator[TestClient]:
    engine = make_engine(db_file)
    ensure_schema(engine)
    with Session(engine) as session:
        seed_demo(session, today=TODAY)
        session.commit()
    engine.dispose()
    app = create_app(db_file, clock=clock)
    with TestClient(app, base_url="http://localhost:8420") as client:
        yield client


def days_ago(days: int) -> str:
    return (TODAY - timedelta(days=days)).isoformat()


def test_numbers_of_a_period(client: TestClient) -> None:
    data = client.get(URL, params={"start": days_ago(29)}).json()
    assert (data["start"], data["end"], data["today"]) == (
        days_ago(29),
        TODAY.isoformat(),
        TODAY.isoformat(),
    )
    assert data["step"] == "week"
    assert len(data["steps"]) == len(data["closed"]) == len(data["born_closed"])
    assert data["totals"]["sessions"]["value"] == sum(sum(r["sessions"]) for r in data["activity"])
    assert data["totals"]["closed"]["value"] == sum(data["closed"])
    assert data["plan"]["compared"] == len(data["plan"]["items"])
    assert {row["slug"] for row in data["focus"]} >= {"coffee-dashboard", "sql-practice"}
    assert data["deadlines"][0]["days"] < 0


def test_without_dates_it_is_all_time(client: TestClient) -> None:
    data = client.get(URL).json()
    assert data["end"] == TODAY.isoformat()
    assert date.fromisoformat(data["start"]) == TODAY - timedelta(days=28)


def test_one_project(client: TestClient) -> None:
    data = client.get(URL, params={"project": "sql-practice"}).json()
    assert [row["slug"] for row in data["focus"]] == ["sql-practice"]


def test_unknown_project_and_a_turned_period_are_errors(client: TestClient) -> None:
    assert client.get(URL, params={"project": "nope"}).status_code == 404
    turned = client.get(URL, params={"start": days_ago(0), "end": days_ago(5)})
    assert turned.status_code == 422
    assert "after" in turned.json()["error"]["message"]
    assert client.get(URL, params={"start": "yesterday"}).status_code == 422


def test_a_period_of_a_thousand_years_is_refused(client: TestClient) -> None:
    """A typo in the year must not make the server draw a calendar for minutes."""
    assert client.get(URL, params={"start": "1026-11-01"}).status_code == 422


def test_reading_writes_nothing(client: TestClient, db_file: Path) -> None:
    before = len(client.get("/api/v1/events", params={"limit": 1000}).json())
    client.get(URL)
    assert len(client.get("/api/v1/events", params={"limit": 1000}).json()) == before


# --- command ------------------------------------------------------------------


@pytest.fixture
def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("ORBIT_DB", str(tmp_path / "demo.db"))
    runner = CliRunner()
    runner.invoke(cli, ["seed", "--demo"])

    def invoke(*args: str) -> Result:
        return runner.invoke(cli, list(args))

    return invoke


def test_stats_for_claude(run: Any) -> None:
    result = run("stats", "--json")
    assert result.exit_code == 0, result.output
    data = json.loads(result.stdout)
    assert data["totals"]["sessions"]["value"] > 0
    assert (date.fromisoformat(data["end"]) - date.fromisoformat(data["start"])).days == 29
    assert "attention" in data["focus"][0]


def test_stats_for_a_person(run: Any) -> None:
    result = run("stats", "sql-practice", "--days", "90")
    assert result.exit_code == 0, result.output
    assert "sql-practice" in result.output
    assert "coffee" not in result.output
    assert run("stats", "--days", "0").exit_code == 1
