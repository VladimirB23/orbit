"""Runtime settings read from environment variables."""

import os
from pathlib import Path

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
