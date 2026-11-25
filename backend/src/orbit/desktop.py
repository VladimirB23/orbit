"""Orbit as a program of the desktop: no console, its own window, one server (ADR 0009)."""

import ctypes
import json
import subprocess
import sys
import time
import webbrowser
from collections.abc import Callable
from http.client import HTTPConnection, HTTPException
from pathlib import Path
from typing import TextIO

from orbit.local import HOST, port_is_free

BROWSERS = ("chrome.exe", "msedge.exe")
RACE_SECONDS = 10.0
LOG_BYTES = 1_000_000
ERROR_ICON = 0x10
ALREADY_EXISTS = 183


def running_orbit(port: int) -> str | None:
    """Database name of an orbit server on this port, None if something else answers."""
    connection = HTTPConnection(HOST, port, timeout=1)
    try:
        connection.request("GET", "/api/v1/meta")
        return str(json.loads(connection.getresponse().read())["database"]["name"])
    except (OSError, HTTPException, ValueError, KeyError, TypeError):
        return None
    finally:
        connection.close()


def launch(
    *,
    db_name: str,
    port: int,
    log: Path,
    background: bool,
    claim: Callable[[], bool],
    serve: Callable[[Callable[[], object]], object],
    open_window: Callable[[str], object],
    tell: Callable[[str], object],
) -> None:
    """Becomes the server, or finds the one that runs already."""
    url = f"http://{HOST}:{port}"

    started = False

    def show() -> None:
        if not background:
            open_window(url)

    def on_ready() -> None:
        nonlocal started
        started = True
        show()

    def join(name: str | None) -> None:
        if name == db_name:
            show()
        elif name is None and port_is_free(port):
            tell(f"Orbit не запустился. Подробности: {log}")
        elif name is None:
            tell(f"Порт {port} занят другой программой.")
        else:
            tell(f"На порту {port} уже работает Orbit с другой базой: {name}.")

    if not port_is_free(port):
        join(_wait_for_orbit(port))
        return
    if not claim():  # another click has come first and is still upgrading the database
        join(_wait_for_orbit(port, coming=True))
        return
    try:
        serve(on_ready)
    except SystemExit:  # started from a terminal at the same moment, or could not start
        join(_wait_for_orbit(port))
    except Exception as exc:
        tell(f"Orbit не запустился: {exc}")
        raise
    else:
        if not started:
            tell(f"Orbit не запустился. Подробности: {log}")


def _wait_for_orbit(port: int, coming: bool = False) -> str | None:
    """A server that is just starting takes the port before it can answer."""
    end = time.monotonic() + RACE_SECONDS
    while True:
        name = running_orbit(port)
        if name is not None or time.monotonic() > end or (not coming and port_is_free(port)):
            return name
        time.sleep(0.2)


def open_log(path: Path) -> TextIO:
    """Appended to, so that two starts do not erase each other; begun anew when it is long."""
    long = path.exists() and path.stat().st_size > LOG_BYTES
    return path.open("w" if long else "a", encoding="utf-8", buffering=1)


# --- the screen of Windows ---------------------------------------------------------


def registered_program(name: str) -> str | None:
    """Where Windows keeps a program, by "App Paths"."""
    if sys.platform != "win32":
        return None
    import winreg

    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            path = winreg.QueryValue(
                root, rf"Software\Microsoft\Windows\CurrentVersion\App Paths\{name}"
            )
        except OSError:
            continue
        if path and Path(path).is_file():
            return path
    return None


def find_browser(look_up: Callable[[str], str | None] = registered_program) -> str | None:
    return next((path for name in BROWSERS if (path := look_up(name))), None)


def open_window(url: str) -> None:
    """A window without tabs and an address line; an ordinary tab where there is no such browser."""
    browser = find_browser()
    if browser is None:
        webbrowser.open(url)
    else:
        subprocess.Popen([browser, f"--app={url}"], close_fds=True)


def tell(text: str) -> None:
    if sys.platform == "win32":
        ctypes.windll.user32.MessageBoxW(None, text, "Orbit", ERROR_ICON)


def claim(port: int) -> bool:
    """True for the first process that asks; Windows lets the claim go when the process ends."""
    if sys.platform != "win32":
        return True
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.restype = ctypes.c_void_p
    handle = kernel.CreateMutexW(None, False, f"Local\\orbit-{port}")
    return bool(handle) and ctypes.get_last_error() != ALREADY_EXISTS


def windowless_python() -> Path:
    return Path(sys.executable).with_name("pythonw.exe")


def start_windowless(arguments: list[str]) -> None:
    """The same command again, without this console."""
    subprocess.Popen(
        [str(windowless_python()), "-m", "orbit", *arguments],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
        close_fds=True,
    )
