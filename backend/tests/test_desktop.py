"""Orbit without a console: one click starts it, the next one only opens a window."""

import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from typer.testing import CliRunner

from orbit import desktop, taskbar
from orbit.api import server
from orbit.api.app import create_app
from orbit.cli import app as cli
from orbit.local import ask_to_stop, port_is_free, run_file

ROOT = Path(__file__).resolve().parents[2]
LOG = Path("orbit.log")


def free_port() -> int:
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait(condition: Callable[[], bool], seconds: float = 10) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.05)
    return condition()


class Running:
    """A real server in a thread."""

    def __init__(self, db: Path) -> None:
        self.db, self.port = db, free_port()
        self.mark = run_file(db, self.port)
        ready = threading.Event()
        self.thread = threading.Thread(
            target=lambda: server.run(create_app(db), self.port, ready.set, self.mark), daemon=True
        )
        self.thread.start()
        assert ready.wait(15)

    def ended(self) -> bool:
        return not self.thread.is_alive()


@pytest.fixture
def running(db_file: Path) -> Iterator[Running]:
    one = Running(db_file)
    yield one
    ask_to_stop(one.mark)
    one.thread.join(10)


# --- stopping -------------------------------------------------------------------


def test_a_running_server_leaves_a_mark_next_to_its_database(running: Running) -> None:
    assert running.mark == running.db.parent / f"orbit-{running.port}.run"
    assert running.mark.exists()


def test_without_the_mark_the_server_stops(running: Running) -> None:
    ask_to_stop(running.mark)
    assert wait(running.ended)
    assert port_is_free(running.port)


def test_a_mark_of_another_server_is_left_alone(running: Running) -> None:
    running.mark.write_text("another", encoding="utf-8")
    assert wait(running.ended)
    assert running.mark.read_text(encoding="utf-8") == "another"


def test_a_mark_that_is_being_read_is_still_taken_away(tmp_path: Path) -> None:
    """Windows refuses to delete an open file, and the server opens its mark twice a second."""
    mark = tmp_path / "orbit-1.run"
    mark.write_text("x", encoding="utf-8")
    reader = mark.open()
    threading.Timer(0.3, reader.close).start()
    ask_to_stop(mark)
    assert not mark.exists()


@pytest.mark.skipif(sys.platform != "win32", reason="only Windows refuses")
def test_a_mark_held_for_good_is_an_error(tmp_path: Path) -> None:
    mark = tmp_path / "orbit-1.run"
    mark.write_text("x", encoding="utf-8")
    with mark.open(), pytest.raises(PermissionError):
        ask_to_stop(mark, seconds=0.2)


def test_stop_command(running: Running) -> None:
    result = CliRunner().invoke(cli, ["--db", str(running.db), "stop", "--port", str(running.port)])
    assert result.exit_code == 0, result.output
    assert "stopped" in result.output
    assert wait(running.ended)


def test_stop_when_nothing_runs(db_file: Path) -> None:
    result = CliRunner().invoke(cli, ["--db", str(db_file), "stop", "--port", str(free_port())])
    assert result.exit_code == 0
    assert "not running" in result.output


def test_a_mark_left_by_a_crash_is_swept_away(db_file: Path) -> None:
    port = free_port()
    mark = run_file(db_file, port)
    mark.write_text("crashed", encoding="utf-8")
    result = CliRunner().invoke(cli, ["--db", str(db_file), "stop", "--port", str(port)])
    assert "not running" in result.output
    assert not mark.exists()


def test_stop_does_not_touch_a_server_with_another_database(
    running: Running, tmp_path: Path
) -> None:
    other = tmp_path / "other" / "orbit.db"
    other.parent.mkdir()
    result = CliRunner().invoke(cli, ["--db", str(other), "stop", "--port", str(running.port)])
    assert result.exit_code == 1
    assert "another database" in result.output
    assert not running.ended()


# --- starting -------------------------------------------------------------------


class Desk:
    """Everything the launcher does to the screen, written down instead."""

    def __init__(self) -> None:
        self.opened: list[str] = []
        self.told: list[str] = []
        self.served: list[int] = []

    def launch(
        self, port: int, *, name: str = "orbit.db", background: bool = False, first: bool = True
    ) -> None:
        def serve(on_ready: Callable[[], object]) -> None:
            self.served.append(port)
            on_ready()

        desktop.launch(
            db_name=name,
            port=port,
            log=LOG,
            claim=lambda: first,
            background=background,
            serve=serve,
            open_window=self.opened.append,
            tell=self.told.append,
        )


def test_the_first_click_starts_the_server_and_opens_a_window() -> None:
    desk, port = Desk(), free_port()
    desk.launch(port)
    assert desk.served == [port]
    assert desk.opened == [f"http://127.0.0.1:{port}"]


def test_the_second_click_only_opens_a_window(running: Running) -> None:
    desk = Desk()
    desk.launch(running.port)
    assert (desk.served, desk.told) == ([], [])
    assert desk.opened == [f"http://127.0.0.1:{running.port}"]


def test_at_logon_no_window(running: Running) -> None:
    desk, port = Desk(), free_port()
    desk.launch(port, background=True)
    desk.launch(running.port, background=True)
    assert desk.served == [port]
    assert (desk.opened, desk.told) == ([], [])


def test_another_database_on_the_port_is_said_aloud(running: Running) -> None:
    desk = Desk()
    desk.launch(running.port, name="demo.db")
    assert not desk.opened and not desk.served
    assert "orbit.db" in desk.told[0]


def test_another_program_on_the_port_is_said_aloud() -> None:
    import socket

    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        desk = Desk()
        desk.launch(busy.getsockname()[1])
    assert not desk.opened and not desk.served
    assert len(desk.told) == 1


def test_two_clicks_at_once_end_in_one_server_and_a_window(
    running: Running, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The port was free when asked and taken a moment later."""

    def lost(_on_ready: object) -> None:
        raise SystemExit(1)

    monkeypatch.setattr(desktop, "port_is_free", lambda _port: True)
    desk = Desk()
    desktop.launch(
        db_name="orbit.db",
        port=running.port,
        log=LOG,
        claim=lambda: True,
        background=False,
        serve=lost,
        open_window=desk.opened.append,
        tell=desk.told.append,
    )
    assert desk.opened == [f"http://127.0.0.1:{running.port}"]
    assert desk.told == []


def test_the_second_of_two_clicks_waits_for_the_first(db_file: Path) -> None:
    """The first one is still upgrading the database: its port is free, nothing answers yet."""
    desk, started = Desk(), threading.Event()
    port = free_port()
    servers: list[threading.Thread] = []

    def begin() -> None:
        mark = run_file(db_file, port)
        server.run(create_app(db_file), port, started.set, mark)

    def later() -> None:
        time.sleep(0.8)
        begin()

    servers.append(threading.Thread(target=later, daemon=True))
    servers[0].start()
    desk.launch(port, first=False)
    assert desk.served == []
    assert desk.opened == [f"http://127.0.0.1:{port}"]
    started.wait(5)
    ask_to_stop(run_file(db_file, port))
    servers[0].join(10)


def test_a_first_click_that_failed_is_said_aloud(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(desktop, "RACE_SECONDS", 0.3)
    desk = Desk()
    desk.launch(free_port(), first=False)
    assert "не запустился" in desk.told[0]


@pytest.mark.skipif(sys.platform != "win32", reason="Windows mutex")
def test_only_one_process_claims_a_port() -> None:
    port = free_port()
    ask = f"from orbit import desktop; print(desktop.claim({port}))"
    assert desktop.claim(port) is True
    out = subprocess.run([sys.executable, "-c", ask], capture_output=True, text=True, timeout=30)
    assert out.stdout.strip() == "False"
    ask = f"from orbit import desktop; print(desktop.claim({port + 1}))"
    out = subprocess.run([sys.executable, "-c", ask], capture_output=True, text=True, timeout=30)
    assert out.stdout.strip() == "True"


def test_a_crash_is_said_aloud_and_not_hidden() -> None:
    def crash(_on_ready: object) -> None:
        raise RuntimeError("disk is full")

    desk = Desk()
    with pytest.raises(RuntimeError):
        desktop.launch(
            db_name="orbit.db",
            port=free_port(),
            log=LOG,
            claim=lambda: True,
            background=False,
            serve=crash,
            open_window=desk.opened.append,
            tell=desk.told.append,
        )
    assert "disk is full" in desk.told[0]


@pytest.mark.parametrize("failing", [lambda _ready: None, lambda _ready: sys.exit(1)])
def test_a_server_that_never_got_ready_is_said_aloud(
    failing: Callable[[object], object],
) -> None:
    """The database could not be opened: uvicorn only writes to the log and returns."""
    desk = Desk()
    desktop.launch(
        db_name="orbit.db",
        port=free_port(),
        log=LOG,
        claim=lambda: True,
        background=False,
        serve=failing,
        open_window=desk.opened.append,
        tell=desk.told.append,
    )
    assert desk.opened == []
    assert "orbit.log" in desk.told[0]


def test_the_log_is_kept_until_it_is_long(tmp_path: Path) -> None:
    path = tmp_path / "orbit.log"
    for _ in range(2):
        with desktop.open_log(path) as log:
            log.write("line\n")
    assert path.read_text(encoding="utf-8") == "line\nline\n"
    path.write_text("x" * (desktop.LOG_BYTES + 1), encoding="utf-8")
    desktop.open_log(path).close()
    assert path.read_text(encoding="utf-8") == ""


@pytest.mark.parametrize(
    ("installed", "expected"),
    [
        ({"chrome.exe": "C:\\c.exe", "msedge.exe": "C:\\e.exe"}, "C:\\c.exe"),
        ({"msedge.exe": "C:\\e.exe"}, "C:\\e.exe"),
        ({}, None),
    ],
)
def test_the_window_prefers_chrome_then_edge(
    installed: dict[str, str], expected: str | None
) -> None:
    assert desktop.find_browser(installed.get) == expected


# --- shortcuts ------------------------------------------------------------------


def shortcuts(folder: Path, *flags: str) -> subprocess.CompletedProcess[str]:
    script = ROOT / "bin" / "shortcuts.ps1"
    command = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)]
    return subprocess.run(
        [*command, "-Root", str(folder), *flags], capture_output=True, text=True, timeout=60
    )


def links(folder: Path) -> list[str]:
    return sorted(p.relative_to(folder).as_posix() for p in folder.rglob("*.lnk"))


@pytest.mark.skipif(sys.platform != "win32", reason="Windows shortcuts")
def test_shortcuts_come_and_go(tmp_path: Path) -> None:
    done = shortcuts(tmp_path, "-WhatIf")
    assert done.returncode == 0, done.stderr
    assert links(tmp_path) == []

    assert shortcuts(tmp_path).returncode == 0
    assert links(tmp_path) == [
        "Desktop/Orbit.lnk",
        "Programs/Orbit/Orbit.lnk",
        "Programs/Orbit/Stop Orbit.lnk",
    ]
    assert shortcuts(tmp_path, "-Autostart").returncode == 0
    assert "Startup/Orbit.lnk" in links(tmp_path)

    assert shortcuts(tmp_path, "-Remove").returncode == 0
    assert links(tmp_path) == []
    assert not (tmp_path / "Programs" / "Orbit").exists()


@pytest.mark.skipif(sys.platform != "win32", reason="Windows shortcuts")
def test_a_shortcut_starts_pythonw_of_the_project(tmp_path: Path) -> None:
    assert shortcuts(tmp_path).returncode == 0
    link = tmp_path / "Desktop" / "Orbit.lnk"
    read = f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{link}');"
    out = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            read + "$s.TargetPath;$s.Arguments;$s.IconLocation",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    ).stdout.splitlines()
    assert out[0].lower().endswith("backend\\.venv\\scripts\\pythonw.exe")
    assert out[1] == "-m orbit app"
    assert out[2].lower().endswith("orbit.ico,0")


@pytest.mark.skipif(sys.platform != "win32", reason="Windows shortcuts")
def test_a_shortcut_made_by_somebody_else_is_left_alone(tmp_path: Path) -> None:
    link = tmp_path / "Desktop" / "Orbit.lnk"
    link.parent.mkdir()
    make = (
        f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{link}');"
        "$s.TargetPath=$env:ComSpec;$s.Arguments='/c echo mine';$s.Save()"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", make], check=True, timeout=60)
    before = link.read_bytes()

    done = shortcuts(tmp_path)
    assert done.returncode == 0
    assert "left alone" in done.stdout
    assert link.read_bytes() == before
    assert "Programs/Orbit/Orbit.lnk" in links(tmp_path)

    assert shortcuts(tmp_path, "-Remove").returncode == 0
    assert links(tmp_path) == ["Desktop/Orbit.lnk"]

    assert shortcuts(tmp_path, "-Force").returncode == 0
    assert link.read_bytes() != before


# --- taskbar ------------------------------------------------------------------------


def read(store: taskbar.Store, pid: int) -> str | None:
    try:
        return store.get(pid)
    finally:
        store.close()


@pytest.mark.skipif(sys.platform != "win32", reason="Windows taskbar")
def test_shortcuts_that_open_a_window_carry_its_id(tmp_path: Path) -> None:
    assert shortcuts(tmp_path).returncode == 0
    ids = {
        name: read(taskbar.Store.of_file(tmp_path / name), taskbar.ID) for name in links(tmp_path)
    }
    assert ids == {
        "Desktop/Orbit.lnk": taskbar.APP_ID,
        "Programs/Orbit/Orbit.lnk": taskbar.APP_ID,
        "Programs/Orbit/Stop Orbit.lnk": None,
    }


@pytest.mark.skipif(sys.platform != "win32", reason="Windows taskbar")
def test_a_window_gets_the_id_and_the_way_to_start_again() -> None:
    import ctypes

    user = ctypes.WinDLL("user32")
    user.CreateWindowExW.restype = ctypes.c_void_p
    handle = user.CreateWindowExW(0, "STATIC", "Orbit", 0, 0, 0, 1, 1, None, None, None, None)
    try:
        assert taskbar.mark_window(handle, "pythonw -m orbit app") is True
        assert taskbar.mark_window(handle, "another") is False
        assert read(taskbar.Store.of_window(handle), taskbar.ID) == taskbar.APP_ID
        command = read(taskbar.Store.of_window(handle), taskbar.RELAUNCH_COMMAND)
        assert command == "pythonw -m orbit app"
    finally:
        user.DestroyWindow(ctypes.c_void_p(handle))


@pytest.mark.skipif(sys.platform != "win32", reason="Windows taskbar")
def test_waits_until_the_window_appears() -> None:
    seen = iter([[], [], [7]])
    marked: list[tuple[int, str]] = []

    def mark(handle: int, command: str) -> bool:
        marked.append((handle, command))
        return True

    assert taskbar.adopt_windows("run", windows=lambda: next(seen), mark=mark) is True
    assert marked == [(7, "run")]


@pytest.mark.skipif(sys.platform != "win32", reason="Windows taskbar")
def test_gives_up_quietly() -> None:
    def refuse(_handle: int, _command: str) -> bool:
        raise OSError("access denied")

    assert taskbar.adopt_windows("run", windows=lambda: [7], mark=refuse) is False
    assert taskbar.adopt_windows("run", seconds=0.1, windows=list) is False


def test_the_icon_is_where_the_taskbar_will_look() -> None:
    assert taskbar.ICON.is_file()


def test_a_path_with_a_space_survives_in_the_command() -> None:
    command = taskbar.relaunch_command(["--db", "C:\\my data\\orbit.db", "app"])
    assert command.endswith('-m orbit --db "C:\\my data\\orbit.db" app')
