"""Session journals in the vault -> session records. Text in, plain data out."""

from datetime import datetime
from pathlib import Path

from orbit.domain.sessions import SessionRecord
from orbit.journal import parse_journal, read_journals

ID_A = "a1b2c3d4-0000-4000-8000-000000000001"
ID_B = "b2c3d4e5-0000-4000-8000-000000000002"

ENTRY_A = f"""<!-- session:{ID_A} -->
### 2026-11-24 15:04–17:15 · Этап 2 проекта на FastAPI
- **Запрос:** Приступаем к следующему шагу.
- **Реплик:** 11 · **Файлы:** `a.py`, `backend/b.py` (+22)
- **Коммиты (6):** `47ef46b` docs: ADR 0003; `4d9d076` fix(serve): clean stop …
- Папка `d:\\Projects\\orbit` · продолжить: `claude --resume {ID_A}`
"""
ENTRY_B = f"""<!-- session:{ID_B} -->
### 2026-12-30 14:40 – 02.01 21:24 · Ревизия · скиллов
- **Запрос:** Посмотри.
- **Реплик:** 5 · **Файлы:** нет
- Папка `c:\\Users\\Ann Lee` · продолжить: `claude --resume {ID_B}`
"""


def journal(*entries: str) -> str:
    body = "\n".join(entries)
    return f"# orbit — Журнал сессий\n\n<!-- log:start -->\n{body}\n<!-- log:end -->\n\n---\n"


def local(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, day, hour, minute).astimezone()


def test_entry_becomes_a_record() -> None:
    [record] = parse_journal(journal(ENTRY_A), "orbit").records
    assert record == SessionRecord(
        external_id=ID_A,
        project="orbit",
        started_at=local(2026, 11, 24, 15, 4),
        ended_at=local(2026, 11, 24, 17, 15),
        title="Этап 2 проекта на FastAPI",
        prompts=11,
        files=24,
        commits=6,
        folder="d:\\Projects\\orbit",
    )


def test_session_over_new_year_ends_in_the_next_year() -> None:
    [record] = parse_journal(journal(ENTRY_B), "general").records
    assert record.started_at == local(2026, 12, 30, 14, 40)
    assert record.ended_at == local(2027, 1, 2, 21, 24)


def test_no_files_no_commits_and_a_dot_inside_the_title() -> None:
    [record] = parse_journal(journal(ENTRY_B), "general").records
    assert (record.files, record.commits) == (0, 0)
    assert record.title == "Ревизия · скиллов"


def test_every_entry_is_read() -> None:
    parsed = parse_journal(journal(ENTRY_A, ENTRY_B), "orbit")
    assert [r.external_id for r in parsed.records] == [ID_A, ID_B]
    assert parsed.unreadable == 0


def test_unreadable_entry_is_counted_and_does_not_hide_the_others() -> None:
    undated = ENTRY_B.replace("2026-12-30 14:40 – 02.01 21:24", "дата неизвестна")
    impossible = ENTRY_B.replace("2026-12-30 14:40", "2026-13-99 14:40")
    parsed = parse_journal(journal(undated, impossible, ENTRY_A), "orbit")
    assert [r.external_id for r in parsed.records] == [ID_A]
    assert parsed.unreadable == 2


def test_text_outside_the_log_is_not_an_entry() -> None:
    assert parse_journal(ENTRY_A, "orbit").records == []


def test_id_that_is_not_a_uuid_is_unreadable() -> None:
    """The id ends up in a command the person pastes into a terminal."""
    parsed = parse_journal(journal(ENTRY_A.replace(ID_A, "x; rm -rf /")), "orbit")
    assert parsed.records == []
    assert parsed.unreadable == 1


def test_missing_folder_line_is_fine() -> None:
    [record] = parse_journal(journal(ENTRY_A.rsplit("- Папка", 1)[0]), "orbit").records
    assert record.folder is None


def test_journals_are_found_by_project_folder(tmp_path: Path) -> None:
    for name, entry in (("orbit", ENTRY_A), ("General", ENTRY_B)):
        folder = tmp_path / "Inbox" / name
        folder.mkdir(parents=True)
        (folder / "Журнал сессий.md").write_text(journal(entry), encoding="utf-8")
    (tmp_path / "Inbox" / "empty").mkdir()
    parsed = read_journals(tmp_path)
    assert {(r.external_id, r.project) for r in parsed.records} == {
        (ID_A, "orbit"),
        (ID_B, "general"),
    }


def test_vault_without_journals_is_empty(tmp_path: Path) -> None:
    assert read_journals(tmp_path / "nowhere").records == []
