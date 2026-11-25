"""CSV for Tableau: facts and dimensions that agree with the screen and leak nothing."""

import csv
import json
from datetime import date, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session
from typer.testing import CliRunner, Result

from orbit.cli import app as cli
from orbit.domain import analytics as a
from orbit.domain.enums import Actor, Status
from orbit.domain.errors import ValidationError
from orbit.domain.service import Orbit
from orbit.domain.undo import undo
from orbit.export import PRIVATE_NOTE, TABLES, export_csv
from orbit.seed import seed_demo
from tests.conftest import TODAY, FakeClock


def read(folder: Path, table: str) -> list[dict[str, str]]:
    with (folder / f"{table}.csv").open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


@pytest.fixture
def demo(session: Session, clock: FakeClock) -> Orbit:
    seed_demo(session, today=TODAY)
    return Orbit(session, Actor.SYSTEM, clock)


@pytest.fixture
def out(tmp_path: Path) -> Path:
    return tmp_path / "out"


# --- shape ----------------------------------------------------------------------


def test_every_table_is_written_with_the_columns_of_the_dictionary(demo: Orbit, out: Path) -> None:
    counts = export_csv(demo, out, private=False)
    assert set(counts) == {t.name for t in TABLES}
    for table in TABLES:
        rows = read(out, table.name)
        assert len(rows) == counts[table.name] > 0, table.name
        assert list(rows[0]) == [c.name for c in table.columns], table.name


def test_dictionary_lies_next_to_the_data_and_names_everything(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    text = (out / "DICTIONARY.md").read_text(encoding="utf-8")
    for table in TABLES:
        assert f"## {table.name}" in text
        for column in table.columns:
            assert f"| `{column.name}` |" in text
            assert column.about
            assert column.about in text


def test_facts_point_only_at_known_dimensions(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    projects = {r["project_id"] for r in read(out, "dim_project")}
    milestones = {r["milestone_id"] for r in read(out, "dim_milestone")} | {""}
    statuses = {r["status"] for r in read(out, "dim_status")}
    days = {r["date"] for r in read(out, "dim_date")}
    for fact in ("fact_activity", "fact_task", "fact_milestone", "fact_status_change"):
        for row in read(out, fact):
            assert row["project_id"] in projects
            assert row.get("milestone_id", "") in milestones
            assert row.get("status", "done") in statuses
            for key, value in row.items():
                if key == "date" or key.endswith("_date"):
                    assert value == "" or value in days, (fact, key, value)


def test_calendar_has_no_holes(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    days = [date.fromisoformat(r["date"]) for r in read(out, "dim_date")]
    assert all(b - a == timedelta(days=1) for a, b in pairwise(days))
    monday = next(r for r in read(out, "dim_date") if r["date"] == "2026-11-23")
    assert (monday["week_start"], monday["weekday"], monday["is_weekend"]) == (
        "2026-11-23",
        "1",
        "0",
    )
    assert (monday["month"], monday["quarter"]) == ("2026-11-01", "2026-Q4")


def test_the_same_database_gives_the_same_bytes(demo: Orbit, out: Path, tmp_path: Path) -> None:
    export_csv(demo, out, private=False)
    export_csv(demo, tmp_path / "again", private=False)
    for path in out.iterdir():
        assert path.read_bytes() == (tmp_path / "again" / path.name).read_bytes()


def test_russian_text_is_plain_utf8(orbit: Orbit, out: Path) -> None:
    orbit.add_project("a", name='Атлас, "Компас"')
    export_csv(orbit, out, private=True)
    raw = (out / "dim_project.csv").read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf")  # a BOM would become a part of the first field name
    assert b"\r" not in raw
    [row] = read(out, "dim_project")
    assert row["project"] == 'Атлас, "Компас"'


# --- numbers ----------------------------------------------------------------------


def test_numbers_agree_with_the_screen(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    totals = a.analyze(demo, a.all_time(demo)).totals
    amounts: dict[str, int] = {}
    for row in read(out, "fact_activity"):
        amounts[row["kind"]] = amounts.get(row["kind"], 0) + int(row["amount"])
    assert amounts["session"] == totals.sessions.value
    assert amounts["commit"] == totals.commits.value
    assert amounts["closed"] == totals.closed.value

    result = a.analyze(demo, a.all_time(demo))
    cycles = sorted(int(r["cycle_days"]) for r in read(out, "fact_task") if r["cycle_days"])
    assert cycles == sorted(i.days for i in result.cycle.items)
    late = sorted(int(r["days_late"]) for r in read(out, "fact_milestone") if r["days_late"])
    assert late == sorted(i.days for i in result.plan.items)


def test_born_closed_is_marked_and_has_no_cycle_time(orbit: Orbit, out: Path) -> None:
    orbit.add_project("a", name="A")
    orbit.add_task("a", "T", status=Status.DONE)
    export_csv(orbit, out, private=True)
    [row] = read(out, "fact_task")
    assert (row["is_born_closed"], row["cycle_days"], row["started_date"]) == ("1", "", "")


def test_what_was_undone_is_not_exported(
    orbit: Orbit, session: Session, clock: FakeClock, out: Path
) -> None:
    orbit.add_project("a", name="A")
    Orbit(session, Actor.OWNER, clock).update_project("a", status=Status.IN_PROGRESS)
    undo(Orbit(session, Actor.OWNER, clock))
    export_csv(orbit, out, private=True)
    assert [r["status"] for r in read(out, "fact_status_change")] == ["backlog"]


def test_archived_projects_are_there_and_marked(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    marks = {r["slug"]: r["is_archived"] for r in read(out, "dim_project")}
    assert marks["portfolio-site"] == "1"
    assert marks["coffee-dashboard"] == "0"


def test_future_projects_are_marked(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    marks = {r["slug"]: r["is_future"] for r in read(out, "dim_project")}
    assert [slug for slug, mark in marks.items() if mark == "1"] == ["reading-list"]


def test_empty_database_gives_headers(orbit: Orbit, out: Path) -> None:
    counts = export_csv(orbit, out, private=True)
    assert counts["fact_task"] == 0
    header = (out / "fact_task.csv").read_text(encoding="utf-8").strip()
    assert header.startswith("task_id,")


# --- privacy ------------------------------------------------------------------------


def test_paths_and_session_ids_stay_home(demo: Orbit, out: Path) -> None:
    export_csv(demo, out, private=False)
    everything = "".join(p.read_text(encoding="utf-8") for p in out.glob("*.csv"))
    assert "D:\\" not in everything
    assert "Inbox" not in everything
    assert all(s.external_id not in everything for s in demo.sessions())
    assert all(s.title not in everything for s in demo.sessions())


def test_real_data_is_labelled_and_kept_out_of_git(orbit: Orbit, out: Path) -> None:
    export_csv(orbit, out, private=True)
    assert "НЕ ПУБЛИКОВАТЬ" in (out / PRIVATE_NOTE).read_text(encoding="utf-8")
    assert (out / ".gitignore").read_text(encoding="utf-8").strip() == "*"


def test_demo_after_real_data_takes_the_label_off(orbit: Orbit, demo: Orbit, out: Path) -> None:
    export_csv(orbit, out, private=True)
    export_csv(demo, out, private=False)
    assert not (out / PRIVATE_NOTE).exists()
    assert not (out / ".gitignore").exists()


def test_a_gitignore_of_somebody_else_is_not_touched(orbit: Orbit, out: Path) -> None:
    out.mkdir()
    (out / ".gitignore").write_text("*.tmp\n", encoding="utf-8")
    export_csv(orbit, out, private=True)
    assert "*.tmp" in (out / ".gitignore").read_text(encoding="utf-8")
    export_csv(orbit, out, private=False)
    assert (out / ".gitignore").read_text(encoding="utf-8") == "*.tmp\n"


def test_a_file_in_place_of_the_folder_is_an_error(orbit: Orbit, out: Path) -> None:
    out.write_text("mine", encoding="utf-8")
    with pytest.raises(ValidationError, match="not a folder"):
        export_csv(orbit, out, private=True)
    assert out.read_text(encoding="utf-8") == "mine"


# --- command --------------------------------------------------------------------------


@pytest.fixture
def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.delenv("ORBIT_DB", raising=False)
    runner = CliRunner()

    def invoke(db: str, *args: str) -> Result:
        return runner.invoke(cli, ["--db", str(tmp_path / db), *args])

    return invoke


def test_command_warns_about_real_data(run: Any, out: Path) -> None:
    run("orbit.db", "project", "add", "a", "--name", "A")
    human = run("orbit.db", "export", "--csv", str(out))
    assert human.exit_code == 0
    assert "do not publish" in human.output.lower()
    data = json.loads(run("orbit.db", "export", "--csv", str(out), "--json").stdout)
    assert data["demo"] is False
    assert "do not publish" in data["warning"].lower()


def test_command_on_demo_data_does_not(run: Any, out: Path) -> None:
    run("demo.db", "seed", "--demo")
    data = json.loads(run("demo.db", "export", "--csv", str(out), "--json").stdout)
    assert (data["demo"], data["warning"]) == (True, None)
    assert data["tables"]["fact_task"] == 24


def test_command_needs_a_folder(run: Any) -> None:
    assert run("demo.db", "export").exit_code != 0


# --- trouble --------------------------------------------------------------------------


def test_a_file_held_by_another_program_is_named(
    orbit: Orbit, out: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def held(self: Path, target: Path) -> Path:
        raise PermissionError(13, "in use")

    monkeypatch.setattr(Path, "replace", held)
    with pytest.raises(ValidationError, match="close it"):
        export_csv(orbit, out, private=True)
    assert list(out.glob("*.partial")) == []


def test_a_typo_in_the_year_does_not_make_an_endless_calendar(orbit: Orbit, out: Path) -> None:
    orbit.add_project("a", name="A", due_date="9999-12-31")
    counts = export_csv(orbit, out, private=True)
    assert counts["dim_date"] < 4000
