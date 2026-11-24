"""Enumerations shared by the domain and the database schema."""

from enum import IntEnum, StrEnum


class Status(StrEnum):
    BACKLOG = "backlog"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELED = "canceled"


CLOSED_STATUSES = frozenset({Status.DONE, Status.CANCELED})


class Priority(IntEnum):
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    URGENT = 4


class Actor(StrEnum):
    VLADIMIR = "vladimir"
    CLAUDE = "claude"
    SYSTEM = "system"


class Entity(StrEnum):
    PROJECT = "project"
    MILESTONE = "milestone"
    TASK = "task"


class Action(StrEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
