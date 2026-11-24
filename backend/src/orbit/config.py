"""Runtime settings: environment variables and an optional file next to the database."""

import os
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from orbit.domain.errors import ValidationError

# src/orbit/config.py -> parents: orbit, src, backend, <repo root>
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = REPO_ROOT / "data" / "orbit.db"
DEMO_DB_PATH = REPO_ROOT / "data" / "demo.db"
UI_DIR = REPO_ROOT / "frontend" / "dist"
DEFAULT_PORT = 8420


def db_path() -> Path:
    """Database file: ORBIT_DB if set, otherwise <repo>/data/orbit.db."""
    value = os.environ.get("ORBIT_DB")
    return Path(value).expanduser().resolve() if value else DEFAULT_DB_PATH


@dataclass(frozen=True)
class Settings:
    vault: Path | None = None  # Obsidian vault: links to notes and session journals


def settings_file(db: Path) -> Path:
    """orbit.db -> orbit.toml: the demo database never sees the real vault."""
    return db.with_suffix(".toml")


def load_settings(db: Path, environ: Mapping[str, str]) -> Settings:
    if vault := environ.get("ORBIT_VAULT"):
        return Settings(vault=Path(vault).expanduser())
    path = settings_file(db)
    if not path.exists():
        return Settings()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8-sig"))
    except tomllib.TOMLDecodeError as exc:
        raise ValidationError(f"{path.name}: {exc}") from None
    unknown = sorted(set(data) - {"vault"})
    if unknown:
        raise ValidationError(f"{path.name}: unknown setting {', '.join(unknown)}; known: vault")
    value = data.get("vault")
    if value is not None and not isinstance(value, str):
        raise ValidationError(f"{path.name}: vault must be a path in quotes")
    return Settings(vault=Path(value).expanduser() if value else None)
