"""Change feed: notices that any process has changed the database.

SQLite keeps a per-connection counter, `PRAGMA data_version`, that moves when another
connection commits. One dedicated connection polls it, so edits from the CLI, scripts
and the API itself are all seen the same way, without triggers or message queues.
"""

import asyncio
import sqlite3
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path

from orbit.domain.clock import Clock

POLL_SECONDS = 0.5


class ChangeFeed:
    def __init__(self, db: Path, clock: Clock, interval: float = POLL_SECONDS) -> None:
        self.version = 0
        self._clock = clock
        self._interval = interval
        self._closed = asyncio.Event()
        self._subscribers: set[asyncio.Event] = set()
        self._connection = sqlite3.connect(
            f"{db.as_uri()}?mode=rw", uri=True, check_same_thread=False, isolation_level=None
        )
        self._connection.execute("PRAGMA query_only=ON")
        self._seen = self._look()

    def _look(self) -> tuple[int, date]:
        """What the interface depends on: the data and today's date (overdue flags)."""
        [data_version] = self._connection.execute("PRAGMA data_version").fetchone()
        return data_version, self._clock.today()

    async def run(self) -> None:
        """Poll until closed."""
        try:
            while not self._closed.is_set():
                try:
                    async with asyncio.timeout(self._interval):
                        await self._closed.wait()
                except TimeoutError:
                    self._poll()
        finally:
            self._connection.close()

    def _poll(self) -> None:
        try:
            current = self._look()
        except sqlite3.OperationalError:  # busy right now: the next tick will see it
            return
        if current != self._seen:
            self._seen = current
            self.version += 1
            self._wake_all()

    def _wake_all(self) -> None:
        for wake in self._subscribers:
            wake.set()

    def close(self) -> None:
        self._closed.set()
        self._wake_all()

    async def versions(self) -> AsyncIterator[int]:
        """The current version at once, then every new one until the feed is closed."""
        wake = asyncio.Event()
        self._subscribers.add(wake)
        sent: int | None = None
        try:
            while True:
                if sent != self.version:
                    sent = self.version
                    yield sent
                elif self._closed.is_set():
                    return
                else:
                    wake.clear()
                    await wake.wait()
        finally:
            self._subscribers.discard(wake)
