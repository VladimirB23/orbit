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

    def day_of(self, moment: datetime) -> date:
        """Local calendar date of a past moment."""
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        return date.today()

    def day_of(self, moment: datetime) -> date:
        return moment.astimezone().date()
