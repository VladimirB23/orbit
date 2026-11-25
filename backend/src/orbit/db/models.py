"""SQLAlchemy 2.0-style models: projects, milestones, tasks, events, sessions."""

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from orbit.db.types import UTCDateTime
from orbit.domain.enums import Action, Actor, Entity, Status

# Stable constraint names: required for Alembic batch migrations on SQLite.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

SUMMARY_MAX = 140
COMMENT_MAX = 280
SESSION_TITLE_MAX = 300


def _in(column: str, values: list[str]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


STATUS_CHECK = _in("status", [s.value for s in Status])


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(STATUS_CHECK, name="status"),
        CheckConstraint("priority BETWEEN 0 AND 4", name="priority"),
        CheckConstraint(f"length(summary) <= {SUMMARY_MAX}", name="summary_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))
    priority: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    summary: Mapped[str | None] = mapped_column(String(SUMMARY_MAX))
    obsidian_path: Mapped[str | None] = mapped_column(String(500))
    repo_path: Mapped[str | None] = mapped_column(String(500))
    github_url: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint(STATUS_CHECK, name="status"),
        CheckConstraint(f"length(summary) <= {SUMMARY_MAX}", name="summary_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    summary: Mapped[str | None] = mapped_column(String(SUMMARY_MAX))
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(STATUS_CHECK, name="status"),
        CheckConstraint("priority BETWEEN 0 AND 4", name="priority"),
        CheckConstraint(f"length(comment) <= {COMMENT_MAX}", name="comment_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    milestone_id: Mapped[int | None] = mapped_column(
        ForeignKey("milestones.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20))
    priority: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    comment: Mapped[str | None] = mapped_column(String(COMMENT_MAX))
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime())
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime())
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Event(Base):
    """Append-only change log. No foreign keys: history outlives deleted rows."""

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint(_in("actor", [a.value for a in Actor]), name="actor"),
        CheckConstraint(_in("entity", [e.value for e in Entity]), name="entity"),
        CheckConstraint(_in("action", [a.value for a in Action]), name="action"),
        Index("ix_events_entity", "entity", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    actor: Mapped[str] = mapped_column(String(20))
    entity: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(20))
    field: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    # Events of one action; the action it takes back, when it is an undo.
    batch: Mapped[str | None] = mapped_column(String(32), index=True)
    undoes: Mapped[str | None] = mapped_column(String(32))


class WorkSession(Base):
    """A Claude session, imported from the journals. Not a SQLAlchemy Session."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(64), unique=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    ended_at: Mapped[datetime] = mapped_column(UTCDateTime())
    title: Mapped[str] = mapped_column(String(SESSION_TITLE_MAX))
    prompts: Mapped[int] = mapped_column(Integer)
    files: Mapped[int] = mapped_column(Integer)
    commits: Mapped[int] = mapped_column(Integer)
    folder: Mapped[str | None] = mapped_column(String(500))
    # The project it was about, when that is not the one it ran in. Never touched by an import.
    topic_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )


class Commit(Base):
    """A commit of the project folder, read from git: a fact like a session."""

    __tablename__ = "commits"
    __table_args__ = (UniqueConstraint("project_id", "sha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    sha: Mapped[str] = mapped_column(String(64))
    committed_at: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
