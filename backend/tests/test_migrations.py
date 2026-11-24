from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import IntegrityError

from orbit.db.engine import (
    current_revision,
    downgrade,
    ensure_schema,
    head_revision,
    make_engine,
    upgrade,
)
from orbit.db.models import Base
from orbit.domain.enums import Status

TABLES = {"projects", "milestones", "tasks", "events", "sessions"}
NOW = "2026-11-24 10:00:00"


def test_upgrade_creates_all_tables(engine: Engine) -> None:
    assert set(inspect(engine).get_table_names()) >= TABLES
    assert current_revision(engine) == head_revision()


def test_migrations_match_models(engine: Engine) -> None:
    """A model change without a migration fails here."""
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []


def test_downgrade_to_base_and_back(db_file: Path) -> None:
    engine = make_engine(db_file)
    upgrade(engine)
    downgrade(engine, "base")
    assert not TABLES & set(inspect(engine).get_table_names())
    upgrade(engine)
    assert set(inspect(engine).get_table_names()) >= TABLES
    engine.dispose()


def _insert_project(engine: Engine, status: str = "backlog", priority: int = 0) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (slug, name, status, priority, position, created_at,"
                " updated_at) VALUES ('p', 'P', :status, :priority, 0, :now, :now)"
            ),
            {"status": status, "priority": priority, "now": NOW},
        )


def test_check_constraint_rejects_unknown_status(engine: Engine) -> None:
    with pytest.raises(IntegrityError):
        _insert_project(engine, status="wip")


def test_check_constraint_rejects_priority_out_of_range(engine: Engine) -> None:
    with pytest.raises(IntegrityError):
        _insert_project(engine, priority=5)


def test_foreign_keys_are_enforced(engine: Engine) -> None:
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO milestones (project_id, name, status, position, created_at,"
                " updated_at) VALUES (999, 'M', 'planned', 0, :now, :now)"
            ),
            {"now": NOW},
        )


def test_every_domain_status_is_allowed_by_the_schema(engine: Engine) -> None:
    """Alembic does not compare CHECK constraints: a new Status needs a migration."""
    for i, status in enumerate(Status):
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO projects (slug, name, status, priority, position, created_at,"
                    " updated_at) VALUES (:slug, 'P', :status, 0, 0, :now, :now)"
                ),
                {"slug": f"p{i}", "status": status.value, "now": NOW},
            )


def test_database_with_data_is_copied_before_a_migration(
    db_file: Path, engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    from orbit.db import engine as module

    with monkeypatch.context() as patch:
        patch.setattr(module, "head_revision", lambda: "9999")
        patch.setattr(module, "upgrade", lambda _engine: None)
        ensure_schema(engine)
    [copy] = (db_file.parent / "backups").glob("orbit-before-upgrade-from-*.db")
    assert copy.stat().st_size > 0


def test_new_database_needs_no_copy(db_file: Path) -> None:
    fresh = make_engine(db_file)
    ensure_schema(fresh)
    fresh.dispose()
    assert not (db_file.parent / "backups").exists()


def test_data_of_the_first_version_survives_the_sessions_migration(db_file: Path) -> None:
    engine = make_engine(db_file)
    upgrade(engine, "0001")
    _insert_project(engine)
    ensure_schema(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT slug FROM projects")).scalars().all() == ["p"]
        assert conn.execute(text("SELECT count(*) FROM sessions")).scalar() == 0
    engine.dispose()
