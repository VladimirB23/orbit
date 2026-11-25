"""the owner of the journal is called by role, not by name

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-25 16:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = "id, at, entity, entity_id, action, field, old_value, new_value, batch, undoes"


def _rebuild(old: str, new: str) -> None:
    """SQLite cannot change a CHECK: a new table, the same rows, the new name."""
    op.create_table(
        "events_new",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("actor", sa.String(length=20), nullable=False),
        sa.Column("entity", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("field", sa.String(length=50), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("batch", sa.String(length=32), nullable=True),
        sa.Column("undoes", sa.String(length=32), nullable=True),
        sa.CheckConstraint(
            "action IN ('create', 'update', 'delete')", name=op.f("ck_events_action")
        ),
        sa.CheckConstraint(f"actor IN ('{new}', 'claude', 'system')", name=op.f("ck_events_actor")),
        sa.CheckConstraint(
            "entity IN ('project', 'milestone', 'task')", name=op.f("ck_events_entity")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
    )
    op.execute(
        f"INSERT INTO events_new ({COLUMNS}, actor)"
        f" SELECT {COLUMNS}, CASE actor WHEN '{old}' THEN '{new}' ELSE actor END FROM events"
    )
    op.drop_table("events")
    op.rename_table("events_new", "events")
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_events_at"), ["at"], unique=False)
        batch_op.create_index("ix_events_entity", ["entity", "entity_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_events_batch"), ["batch"], unique=False)


def upgrade() -> None:
    """Upgrade schema."""
    _rebuild("vladimir", "owner")


def downgrade() -> None:
    """Downgrade schema."""
    _rebuild("owner", "vladimir")
