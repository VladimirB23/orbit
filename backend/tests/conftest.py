from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.enums import Actor
from orbit.domain.service import Orbit

NOW = datetime(2026, 11, 24, 10, 0, tzinfo=UTC)
TODAY = NOW.date()


@dataclass
class FakeClock:
    """Test clock: time moves only when a test says so."""

    current: datetime = NOW
    offset: timedelta = timedelta(0)  # of the local time zone

    def now(self) -> datetime:
        return self.current

    def today(self) -> date:
        return self.day_of(self.current)

    def day_of(self, moment: datetime) -> date:
        return (moment + self.offset).date()

    def advance(self, **kwargs: float) -> None:
        self.current += timedelta(**kwargs)


@pytest.fixture
def db_file(tmp_path: Path) -> Path:
    return tmp_path / "orbit.db"


@pytest.fixture
def engine(db_file: Path) -> Iterator[Engine]:
    engine = make_engine(db_file)
    ensure_schema(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def orbit(session: Session, clock: FakeClock) -> Orbit:
    return Orbit(session, actor=Actor.VLADIMIR, clock=clock)
