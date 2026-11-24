from pathlib import Path

import pytest

from orbit.config import is_demo, load_settings
from orbit.domain.errors import ValidationError

REAL = "vault = 'D:\\Notes\\Vault'\n"


def test_without_a_file_there_is_no_vault(tmp_path: Path) -> None:
    assert load_settings(tmp_path / "orbit.db", {}).vault is None


def test_vault_is_read_from_the_file_next_to_the_database(tmp_path: Path) -> None:
    (tmp_path / "orbit.toml").write_text(REAL, encoding="utf-8")
    assert load_settings(tmp_path / "orbit.db", {}).vault == Path("D:\\Notes\\Vault")


def test_demo_database_does_not_see_the_real_vault(tmp_path: Path) -> None:
    (tmp_path / "orbit.toml").write_text(REAL, encoding="utf-8")
    assert load_settings(tmp_path / "demo.db", {}).vault is None


def test_environment_wins(tmp_path: Path) -> None:
    (tmp_path / "orbit.toml").write_text("vault = 'a'\n", encoding="utf-8")
    assert load_settings(tmp_path / "orbit.db", {"ORBIT_VAULT": "b"}).vault == Path("b")


@pytest.mark.parametrize("text", ["vault = ", "vault = 5", "vauld = 'D:/Notes'"])
def test_mistake_in_the_file_is_named(tmp_path: Path, text: str) -> None:
    (tmp_path / "orbit.toml").write_text(text, encoding="utf-8")
    with pytest.raises(ValidationError, match=r"orbit\.toml"):
        load_settings(tmp_path / "orbit.db", {})


def test_file_saved_by_notepad_with_a_bom_is_read(tmp_path: Path) -> None:
    (tmp_path / "orbit.toml").write_text("vault = 'a'\n", encoding="utf-8-sig")
    assert load_settings(tmp_path / "orbit.db", {}).vault == Path("a")


def test_automatic_dates_are_off_until_asked(tmp_path: Path) -> None:
    db = tmp_path / "orbit.db"
    assert load_settings(db, {}).auto_dates is False
    (tmp_path / "orbit.toml").write_text("auto_dates = true\n", encoding="utf-8")
    assert load_settings(db, {}).auto_dates is True
    assert load_settings(db, {"ORBIT_VAULT": "b"}).auto_dates is True


def test_automatic_dates_are_yes_or_no(tmp_path: Path) -> None:
    (tmp_path / "orbit.toml").write_text("auto_dates = 'yes'\n", encoding="utf-8")
    with pytest.raises(ValidationError, match="auto_dates"):
        load_settings(tmp_path / "orbit.db", {})


@pytest.mark.parametrize(
    ("name", "demo"),
    [("demo.db", True), ("demo-half-year.db", True), ("orbit.db", False), ("my-demo.db", False)],
)
def test_demo_is_known_by_the_file_name(name: str, demo: bool) -> None:
    assert is_demo(Path("data") / name) is demo
