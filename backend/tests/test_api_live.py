"""Live updates: a change made by any process reaches the browser within two seconds."""

import asyncio
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import timedelta
from http.client import HTTPConnection, HTTPResponse
from pathlib import Path

import pytest
import uvicorn
from sqlalchemy.orm import Session

from orbit.api.app import create_app
from orbit.api.feed import ChangeFeed
from orbit.api.server import OrbitServer, server_config
from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.clock import SystemClock
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit
from tests.conftest import FakeClock


def add_project_from_another_process(db: Path, slug: str) -> None:
    """A separate engine is a separate SQLite connection, like the CLI."""
    engine = make_engine(db)
    with Session(engine) as session:
        Orbit(session, actor=Actor.CLAUDE).add_project(slug, name=slug)
        session.commit()
    engine.dispose()


@pytest.fixture
def ready_db(db_file: Path) -> Path:
    engine = make_engine(db_file)
    ensure_schema(engine)
    engine.dispose()
    return db_file


def collect(feed: ChangeFeed, action: object, count: int, timeout: float = 2.0) -> list[int]:
    """Versions seen by one subscriber while `action` runs after the first one."""

    async def scenario() -> list[int]:
        seen: list[int] = []
        poller = asyncio.create_task(feed.run())
        try:
            async with asyncio.timeout(timeout):
                async for version in feed.versions():
                    seen.append(version)
                    if len(seen) == 1 and callable(action):
                        await asyncio.to_thread(action)
                    if len(seen) == count:
                        break
        except TimeoutError:
            pass
        finally:
            feed.close()
            await poller
        return seen

    return asyncio.run(scenario())


def test_subscriber_gets_the_current_version_at_once(ready_db: Path) -> None:
    feed = ChangeFeed(ready_db, SystemClock(), interval=0.05)
    assert collect(feed, None, count=1) == [0]


def test_change_by_another_process_bumps_the_version(ready_db: Path) -> None:
    feed = ChangeFeed(ready_db, SystemClock(), interval=0.05)
    seen = collect(feed, lambda: add_project_from_another_process(ready_db, "a"), count=2)
    assert seen == [0, 1]


def test_quiet_database_sends_nothing(ready_db: Path) -> None:
    feed = ChangeFeed(ready_db, SystemClock(), interval=0.02)
    assert collect(feed, None, count=2, timeout=0.3) == [0]


def test_midnight_is_a_change_because_overdue_flags_depend_on_today(
    ready_db: Path, clock: FakeClock
) -> None:
    feed = ChangeFeed(ready_db, clock, interval=0.05)

    def next_day() -> None:
        clock.current += timedelta(days=1)

    assert collect(feed, next_day, count=2) == [0, 1]


def test_closing_the_feed_ends_every_subscription(ready_db: Path) -> None:
    feed = ChangeFeed(ready_db, SystemClock(), interval=0.05)

    async def scenario() -> list[int]:
        poller = asyncio.create_task(feed.run())
        seen = []
        async with asyncio.timeout(2):
            async for version in feed.versions():
                seen.append(version)
                feed.close()
            await poller
        return seen

    assert asyncio.run(scenario()) == [0]


# --- the whole server ---------------------------------------------------------


@contextmanager
def running_server(db: Path) -> Iterator[int]:
    config = server_config(create_app(db), port=0)
    config.log_level = "error"
    server = OrbitServer(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        server.stop()
        thread.join(timeout=5)
        assert not thread.is_alive(), "server must stop even with an open stream"


def read_event(response: HTTPResponse) -> str:
    """One SSE message as text; keep-alive comments are skipped."""
    lines: list[str] = []
    while True:
        line = response.readline().decode().rstrip("\r\n")
        if line.startswith(":"):
            continue
        if line:
            lines.append(line)
        elif lines:
            return "\n".join(lines)


def test_cli_change_reaches_the_browser_within_two_seconds(ready_db: Path) -> None:
    with running_server(ready_db) as port:
        connection = HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/stream")
        response = connection.getresponse()
        assert response.getheader("content-type", "").startswith("text/event-stream")
        assert "event: change" in read_event(response)

        started = time.monotonic()
        add_project_from_another_process(ready_db, "from-cli")
        assert "event: change" in read_event(response)
        assert time.monotonic() - started < 2
        connection.close()


def test_server_listens_on_loopback_only(ready_db: Path) -> None:
    config: uvicorn.Config = server_config(create_app(ready_db), port=0)
    assert config.host == "127.0.0.1"
