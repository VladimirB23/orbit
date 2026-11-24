"""commits of projects, read from git

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-25 01:40:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "commits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("sha", sa.String(length=64), nullable=False),
        sa.Column("committed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_commits_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commits")),
        sa.UniqueConstraint("project_id", "sha", name=op.f("uq_commits_project_id")),
    )
    with op.batch_alter_table("commits", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_commits_committed_at"), ["committed_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("commits", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_commits_committed_at"))
    op.drop_table("commits")
