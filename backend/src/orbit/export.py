"""CSV for Tableau: facts and dimensions (a star), with a dictionary of fields next to them.

Every table is one query in domain/sql/export. Only whole numbers, days and short texts go out:
a decimal point means different things in different locales. Paths, notes, ids and titles of
sessions stay in the database.
"""

import csv
import io
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text

from orbit.domain.analytics import load_sql, prepare
from orbit.domain.errors import ValidationError
from orbit.domain.service import Orbit

PRIVATE_NOTE = "PRIVATE.txt"
PRIVATE_TEXT = """НЕ ПУБЛИКОВАТЬ: это настоящие данные из живой базы orbit.

В Tableau Public все сохраненное видно всем. Для него выгружай демо:
  orbit --db data/demo-half-year.db export --csv out/tableau
"""
IGNORE_ALL = "*\n"
DICTIONARY = "DICTIONARY.md"


@dataclass(frozen=True)
class Column:
    name: str
    kind: str
    about: str


@dataclass(frozen=True)
class Table:
    name: str
    about: str
    grain: str  # what one row is
    columns: tuple[Column, ...]


def _columns(*rows: tuple[str, str, str]) -> tuple[Column, ...]:
    return tuple(Column(*row) for row in rows)


KEY, NUM, DAY, TXT, FLAG = "ключ", "число", "дата", "текст", "0 или 1"

TABLES = (
    Table(
        "dim_project",
        "Проекты, в том числе архивные.",
        "один проект",
        _columns(
            ("project_id", KEY, "Номер проекта: по нему связываются все факты"),
            ("project", TXT, "Название"),
            ("slug", TXT, "Короткое имя латиницей"),
            ("status", TXT, "Статус на момент выгрузки, связь с dim_status"),
            ("priority", NUM, "Приоритет: 0 нет, 1 низкий, 2 средний, 3 высокий, 4 срочно"),
            ("priority_name", TXT, "Приоритет словом"),
            ("start_date", DAY, "Плановое начало, если задано"),
            ("due_date", DAY, "Срок, если задан"),
            ("created_date", DAY, "День, когда проект заведен в orbit"),
            ("done_date", DAY, "День закрытия, пусто у открытых"),
            ("is_archived", FLAG, "Проект в архиве"),
        ),
    ),
    Table(
        "dim_milestone",
        "Этапы проектов.",
        "один этап",
        _columns(
            ("milestone_id", KEY, "Номер этапа"),
            ("project_id", KEY, "Проект этапа"),
            ("milestone", TXT, "Название"),
            ("position", NUM, "Порядок внутри проекта, с нуля"),
            ("status", TXT, "Статус на момент выгрузки"),
        ),
    ),
    Table(
        "dim_status",
        "Статусы: одни и те же у проектов, этапов и задач.",
        "один статус",
        _columns(
            ("status", KEY, "Код статуса"),
            ("status_name", TXT, "Название по-русски"),
            ("status_group", TXT, "Группа для графиков: ahead, working, stuck, done, canceled"),
            ("sort_order", NUM, "Порядок на графике"),
        ),
    ),
    Table(
        "dim_date",
        "Календарь без пропусков: от первой до последней даты в фактах.",
        "один день",
        _columns(
            ("date", KEY, "День"),
            ("year", NUM, "Год"),
            ("quarter", TXT, "Квартал, например 2026-Q4"),
            ("month", DAY, "Первый день месяца"),
            ("week_start", DAY, "Понедельник недели"),
            ("weekday", NUM, "День недели: 1 понедельник, 7 воскресенье"),
            ("is_weekend", FLAG, "Суббота или воскресенье"),
        ),
    ),
    Table(
        "fact_activity",
        "Что происходило: длинный список, новая мера добавляется строками, а не столбцом. "
        "Длительности сессий здесь нет намеренно: сессия может висеть открытой сутки.",
        "день, проект и вид активности",
        _columns(
            ("date", KEY, "День, связь с dim_date"),
            ("project_id", KEY, "Проект, связь с dim_project"),
            (
                "kind",
                TXT,
                "session - сессии Claude, prompt - реплики в них, commit - коммиты из git, "
                "closed - закрытые задачи, born_closed - созданные сразу закрытыми",
            ),
            ("amount", NUM, "Сколько; складывать можно только внутри одного kind"),
        ),
    ),
    Table(
        "fact_task",
        "Задачи с датами их пути (накопительный снимок). Отмененные действия не учтены.",
        "одна задача",
        _columns(
            ("task_id", KEY, "Номер задачи"),
            ("task", TXT, "Название"),
            ("project_id", KEY, "Проект"),
            ("milestone_id", KEY, "Этап, пусто у задач без этапа"),
            ("status", TXT, "Статус на момент выгрузки, связь с dim_status"),
            ("priority", NUM, "Приоритет: от 0 до 4"),
            ("created_date", DAY, "Заведена"),
            ("started_date", DAY, "Первый раз в работе; пусто, если начало неизвестно"),
            ("done_date", DAY, "Последнее закрытие; пусто у открытых"),
            ("due_date", DAY, "Срок, если задан"),
            (
                "cycle_days",
                NUM,
                "Cycle time: дней от started_date до done_date; пусто, если начало неизвестно",
            ),
            (
                "is_born_closed",
                FLAG,
                "Создана сразу закрытой: это запись прошлого, в темп и cycle time не брать",
            ),
        ),
    ),
    Table(
        "fact_milestone",
        "Этапы: план против факта. План - срок, стоявший в журнале до первого закрытия.",
        "один этап",
        _columns(
            ("milestone_id", KEY, "Номер этапа"),
            ("milestone", TXT, "Название"),
            ("project_id", KEY, "Проект"),
            ("status", TXT, "Статус на момент выгрузки"),
            ("created_date", DAY, "Заведен"),
            ("plan_due_date", DAY, "Плановый срок: последний, поставленный до закрытия"),
            ("done_date", DAY, "Факт: последнее закрытие"),
            ("days_late", NUM, "done_date минус plan_due_date: больше нуля - опоздание"),
            ("due_moves", NUM, "Сколько раз срок переносили до закрытия"),
            ("is_plan_automatic", FLAG, "Срок поставил orbit, а не человек"),
            (
                "plan_state",
                TXT,
                "compared - сравнить можно, open - не закрыт, no_due - срока не было, "
                "set_after - срок поставлен после закрытия, born_closed - создан сразу закрытым",
            ),
        ),
    ),
    Table(
        "fact_status_change",
        "Каждая смена статуса, включая статус при создании. Отмененные действия не учтены.",
        "одна смена статуса",
        _columns(
            ("change_id", KEY, "Номер события в журнале"),
            ("date", DAY, "День, связь с dim_date"),
            ("entity", TXT, "project, milestone или task"),
            ("entity_id", NUM, "Номер проекта, этапа или задачи"),
            ("project_id", KEY, "Проект, которому это принадлежит"),
            ("old_status", TXT, "Прежний статус; пусто при создании"),
            ("status", TXT, "Новый статус, связь с dim_status"),
            ("actor", TXT, "Кто: vladimir, claude или system"),
            ("is_birth", FLAG, "Статус при создании"),
        ),
    ),
)


def export_csv(orbit: Orbit, folder: Path, *, private: bool) -> dict[str, int]:
    """Writes all tables; returns the number of rows in each."""
    if folder.exists() and not folder.is_dir():
        raise ValidationError(f"{folder} is not a folder")
    prepare(orbit)
    files: dict[str, str] = {}
    counts: dict[str, int] = {}
    for table in TABLES:
        rows = orbit.session.execute(text(load_sql(f"export/{table.name}")))
        names = [c.name for c in table.columns]
        assert list(rows.keys()) == names, f"{table.name}: the query and the dictionary differ"
        data = rows.all()
        files[f"{table.name}.csv"] = _csv(names, data)
        counts[table.name] = len(data)
    files[DICTIONARY] = _dictionary()
    folder.mkdir(parents=True, exist_ok=True)
    _label(folder, private)  # first: real data must never lie there without it
    for name, content in files.items():
        _write(folder / name, content)
    return counts


def _csv(names: list[str], rows: object) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(names)
    writer.writerows(rows)  # type: ignore[arg-type]
    return out.getvalue()


def _write(path: Path, content: str) -> None:
    """A reader sees either the old file or the new one, never a half."""
    partial = path.with_name(f"{path.name}.partial")
    partial.write_text(content, encoding="utf-8", newline="\n")
    partial.replace(path)


def _label(folder: Path, private: bool) -> None:
    note, ignore = folder / PRIVATE_NOTE, folder / ".gitignore"
    ours = not ignore.exists() or ignore.read_text(encoding="utf-8") == IGNORE_ALL
    if private:
        _write(note, PRIVATE_TEXT)
        if ours:
            _write(ignore, IGNORE_ALL)
        return
    note.unlink(missing_ok=True)
    if ours:
        ignore.unlink(missing_ok=True)


def _dictionary() -> str:
    lines = [
        "# Словарь полей выгрузки orbit",
        "",
        "Файлы в UTF-8, разделитель - запятая, даты вида 2026-11-25, пусто - значения нет.",
        "Измерения (dim) описывают, факты (fact) считают. Связи: `project_id`, `milestone_id`,",
        "`status` и день (`date` с любой датой факта). Дни местные, а не UTC.",
        "Отмененные действия (Ctrl+Z) в выгрузку не попадают.",
        "",
        "Excel: Data > From Text/CSV > File Origin: 65001 UTF-8.",
        "Двойной щелчок по файлу испортит кириллицу.",
    ]
    for table in TABLES:
        lines += [
            "",
            f"## {table.name}",
            "",
            f"{table.about} Строка: {table.grain}.",
            "",
            "| Поле | Вид | Что это |",
            "| --- | --- | --- |",
        ]
        lines += [f"| `{c.name}` | {c.kind} | {c.about} |" for c in table.columns]
    return "\n".join(lines) + "\n"
