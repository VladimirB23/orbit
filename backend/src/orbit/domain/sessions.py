"""Claude sessions as plain data: what an import brings in and what it reports back."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class SessionRecord:
    """One finished session, wherever it was read from."""

    external_id: str
    project: str  # slug
    started_at: datetime
    ended_at: datetime
    title: str
    prompts: int
    files: int
    commits: int
    folder: str | None


@dataclass
class SessionImport:
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    # Sessions of folders that are not projects in orbit: slug -> how many.
    unknown_projects: dict[str, int] = field(default_factory=dict)
    # Future projects that have got a folder: their first session was in it.
    started: list[str] = field(default_factory=list)
