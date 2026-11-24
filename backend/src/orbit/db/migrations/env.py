"""Alembic environment: works from alembic.ini (dev) and programmatically (orbit)."""

from typing import Any, Literal

from alembic import context
from alembic.autogenerate.api import AutogenContext
from sqlalchemy import Connection

from orbit.config import db_path
from orbit.db.engine import make_engine
from orbit.db.models import Base
from orbit.db.types import UTCDateTime

config = context.config
target_metadata = Base.metadata


def render_item(type_: str, obj: Any, autogen_context: AutogenContext) -> str | Literal[False]:
    """Render app-specific types as plain SQLAlchemy ones: migrations must not import app code."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


def run_with(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_item=render_item,
        # SQLite cannot ALTER most things; batch mode recreates the table instead.
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_with(connection)
        return
    with make_engine(db_path()).begin() as conn:
        run_with(conn)


if context.is_offline_mode():
    raise SystemExit("offline mode is not supported")
run_migrations_online()
