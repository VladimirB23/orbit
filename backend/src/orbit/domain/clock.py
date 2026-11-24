"""Time source. Injected into the service so tests control 'now' and 'today'."""

from datetime import UTC, date, datetime
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        """Current moment, timezone-aware UTC."""
        ...

    def today(self) -> date:
        """Local calendar date: deadlines are local days."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        return date.today()
