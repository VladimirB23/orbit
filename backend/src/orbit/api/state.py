"""What a running server shares between requests."""

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Engine

from orbit.api.feed import ChangeFeed
from orbit.domain.clock import Clock


@dataclass(frozen=True)
class AppState:
    db: Path
    engine: Engine
    clock: Clock
    feed: ChangeFeed
