from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine

from orbit.db.engine import ensure_schema, make_engine


@pytest.fixture
def db_file(tmp_path: Path) -> Path:
    return tmp_path / "orbit.db"


@pytest.fixture
def engine(db_file: Path) -> Iterator[Engine]:
    engine = make_engine(db_file)
    ensure_schema(engine)
    yield engine
    engine.dispose()
