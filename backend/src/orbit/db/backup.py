"""Copies of the database through the SQLite backup API: safe while it is in use."""

import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path

AUTO_KEEP = 14


def backup_dir(source: Path) -> Path:
    return source.parent / "backups"


def copy_database(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)


def safe_copy(source: Path, target: Path) -> None:
    """Copy under a temporary name first: a half-written file never looks like a backup."""
    partial = target.with_suffix(".partial")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial.unlink(missing_ok=True)
    copy_database(source, partial)
    partial.replace(target)


def auto_backup(source: Path, today: date) -> Path | None:
    """One copy a day, the latest AUTO_KEEP of them; manual backups are never removed."""
    if not source.exists():
        return None
    folder = backup_dir(source)
    target = folder / f"{source.stem}-auto-{today:%Y%m%d}.db"
    if target.exists():
        return None
    safe_copy(source, target)
    for old in sorted(folder.glob(f"{source.stem}-auto-*.db"))[:-AUTO_KEEP]:
        old.unlink()
    return target
