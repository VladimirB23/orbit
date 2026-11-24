"""Reads the session journals that a Claude Code hook keeps in the Obsidian vault.

The hook (~/.claude/hooks/obsidian_session_log.py) writes one entry per session to
<vault>/Inbox/<project>/Журнал сессий.md. The vault is only read here, never written.
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from orbit.domain.sessions import SessionRecord

INBOX = "Inbox"
JOURNAL_NAME = "Журнал сессий.md"

LOG_RE = re.compile(r"<!-- log:start -->(.*)<!-- log:end -->", re.S)
ENTRY_RE = re.compile(r"(?=^<!-- session:)", re.M)
# The id becomes part of a command the person pastes into a terminal: nothing but a UUID.
ID_RE = re.compile(r"<!-- session:([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}) -->")
# "2026-11-24 15:04–17:15 · Title" or "2026-11-21 14:40 – 23.11 21:24 · Title"
HEADING_RE = re.compile(
    r"^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) ?– ?(?:(\d{2})\.(\d{2}) )?(\d{2}):(\d{2}) · (.+)$", re.M
)
PROMPTS_RE = re.compile(r"\*\*Реплик:\*\* (\d+)")
FILES_RE = re.compile(r"\*\*Файлы:\*\* (.*)$", re.M)
MORE_RE = re.compile(r"\(\+(\d+)\)\s*$")
COMMITS_RE = re.compile(r"\*\*Коммиты \((\d+)\):\*\*")
FOLDER_RE = re.compile(r"^- Папка `([^`]+)`", re.M)


@dataclass
class Journal:
    records: list[SessionRecord] = field(default_factory=list)
    unreadable: int = 0


def _number(pattern: re.Pattern[str], text: str) -> int:
    match = pattern.search(text)
    return int(match[1]) if match else 0


def _files(entry: str) -> int:
    match = FILES_RE.search(entry)
    if match is None:
        return 0
    return len(re.findall(r"`[^`]+`", match[1])) + _number(MORE_RE, match[1])


def _period(heading: re.Match[str]) -> tuple[datetime, datetime]:
    """Journal times are local; the year of the end is not written."""
    start = datetime.strptime(heading[1], "%Y-%m-%d %H:%M")
    end = start.replace(hour=int(heading[4]), minute=int(heading[5]))
    if heading[2] is not None:
        end = datetime(start.year, int(heading[3]), int(heading[2]), end.hour, end.minute)
        if end < start:
            end = end.replace(year=start.year + 1)
    return start.astimezone(UTC), end.astimezone(UTC)


def _record(entry: str, project: str) -> SessionRecord | None:
    found, heading = ID_RE.match(entry), HEADING_RE.search(entry)
    if found is None or heading is None:
        return None
    try:
        started_at, ended_at = _period(heading)
    except ValueError:  # a date like 2026-13-99
        return None
    folder = FOLDER_RE.search(entry)
    return SessionRecord(
        external_id=found[1],
        project=project,
        started_at=started_at,
        ended_at=ended_at,
        title=heading[6].strip(),
        prompts=_number(PROMPTS_RE, entry),
        files=_files(entry),
        commits=_number(COMMITS_RE, entry),
        folder=folder[1] if folder else None,
    )


def parse_journal(text: str, project: str) -> Journal:
    """One broken entry never hides the others: it is only counted."""
    journal = Journal()
    log = LOG_RE.search(text)
    for entry in ENTRY_RE.split(log[1]) if log else []:
        if not entry.strip():
            continue
        record = _record(entry, project)
        if record is None:
            journal.unreadable += 1
        else:
            journal.records.append(record)
    return journal


def journal_files(vault: Path) -> list[Path]:
    return sorted((vault / INBOX).glob(f"*/{JOURNAL_NAME}"))


def read_journals(vault: Path) -> Journal:
    """Folder name in Inbox = project slug: "General" -> "general"."""
    total = Journal()
    for path in journal_files(vault):
        one = parse_journal(path.read_text(encoding="utf-8"), path.parent.name.lower())
        total.records += one.records
        total.unreadable += one.unreadable
    return total
