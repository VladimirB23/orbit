"""events know their action and what it takes back

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-25 00:05:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema. Old events stay without a batch: they cannot be undone."""
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.add_column(sa.Column("batch", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("undoes", sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f("ix_events_batch"), ["batch"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_events_batch"))
        batch_op.drop_column("undoes")
        batch_op.drop_column("batch")
