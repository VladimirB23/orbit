"""Commits as plain data: what an import brings in and what it reports back."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CommitRecord:
    sha: str
    committed_at: datetime


@dataclass
class CommitImport:
    added: int = 0
    removed: int = 0  # gone from git: amended, rebased, a deleted branch
    unchanged: int = 0
