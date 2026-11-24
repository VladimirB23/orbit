"""Runtime settings: environment variables and an optional file next to the database."""

import os
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
    auto_dates: bool = False  # planned things get a deadline by themselves


def settings_file(db: Path) -> Path:
    """orbit.db -> orbit.toml: the demo database never sees the real vault."""
    return db.with_suffix(".toml")


def is_demo(db: Path) -> bool:
    """Fictional data: nothing real may flow in, and it may be shown to anyone."""
    return db.name.startswith(DEMO_DB_PATH.stem)


KNOWN_SETTINGS = ("vault", "auto_dates")


def load_settings(db: Path, environ: Mapping[str, str]) -> Settings:
    path = settings_file(db)
    data = _read(path) if path.exists() else {}
    vault, auto_dates = data.get("vault"), data.get("auto_dates", False)
    if vault is not None and not isinstance(vault, str):
        raise ValidationError(f"{path.name}: vault must be a path in quotes")
    if not isinstance(auto_dates, bool):
        raise ValidationError(f"{path.name}: auto_dates must be true or false")
    vault = environ.get("ORBIT_VAULT") or vault
    return Settings(vault=Path(vault).expanduser() if vault else None, auto_dates=auto_dates)


def _read(path: Path) -> dict[str, Any]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8-sig"))
    except tomllib.TOMLDecodeError as exc:
        raise ValidationError(f"{path.name}: {exc}") from None
    unknown = sorted(set(data) - set(KNOWN_SETTINGS))
    if unknown:
        raise ValidationError(
            f"{path.name}: unknown setting {', '.join(unknown)}; known: {', '.join(KNOWN_SETTINGS)}"
        )
    return data
