"""One icon on the Windows taskbar: the window of the browser belongs to the shortcut of Orbit.

The taskbar groups windows and shortcuts by an id (AppUserModelID). The window is drawn by the
browser, so it is given our id from outside, together with how to start it again when pinned.
"""

import ctypes
import os
import subprocess
import sys
import time
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

APP_ID = "Orbit.ProjectTracker"
TITLE = "Orbit"
WINDOW_CLASS = "Chrome_WidgetWin_1"  # Chrome and Edge
FORMAT = "{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}"
RELAUNCH_COMMAND, RELAUNCH_ICON, RELAUNCH_NAME, ID = 2, 3, 4, 5
ICON = Path(__file__).resolve().parents[3] / "bin" / "orbit.ico"

VT_LPWSTR = 31
GPS_READWRITE = 2
GET_VALUE, SET_VALUE, COMMIT, RELEASE = 5, 6, 7, 2  # places in the table of IPropertyStore


class _Guid(ctypes.Structure):
    _fields_ = (("bytes", ctypes.c_ubyte * 16),)


class _Key(ctypes.Structure):
    _fields_ = (("format", _Guid), ("pid", ctypes.c_ulong))


class _Variant(ctypes.Structure):
    _fields_ = (
        ("type", ctypes.c_ushort),
        ("reserved", ctypes.c_ushort * 3),
        ("text", ctypes.c_wchar_p),
        ("rest", ctypes.c_void_p),
    )


def _guid(text: str) -> _Guid:
    return _Guid((ctypes.c_ubyte * 16)(*uuid.UUID(text).bytes_le))


IPROPERTYSTORE = "{886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99}"


class Store:
    """Properties of a window or of a shortcut file."""

    def __init__(self, pointer: ctypes.c_void_p) -> None:
        self._this = pointer
        table = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        self._table: Any = table

    @classmethod
    def of_window(cls, handle: int) -> "Store":
        shell = ctypes.WinDLL("shell32")
        pointer = ctypes.c_void_p()
        code = shell.SHGetPropertyStoreForWindow(
            ctypes.c_void_p(handle), ctypes.byref(_guid(IPROPERTYSTORE)), ctypes.byref(pointer)
        )
        return cls(_checked(code, pointer))

    @classmethod
    def of_file(cls, path: Path) -> "Store":
        shell = ctypes.WinDLL("shell32")
        pointer = ctypes.c_void_p()
        code = shell.SHGetPropertyStoreFromParsingName(
            ctypes.c_wchar_p(str(path)),
            None,
            GPS_READWRITE,
            ctypes.byref(_guid(IPROPERTYSTORE)),
            ctypes.byref(pointer),
        )
        return cls(_checked(code, pointer))

    def _call(self, place: int, *args: Any) -> None:
        kinds = [ctypes.c_void_p] * (len(args) + 1)
        method = ctypes.WINFUNCTYPE(ctypes.c_long, *kinds)(self._table[place])
        code = method(self._this, *args)
        if code < 0:
            raise OSError(code, "property store")

    def get(self, pid: int) -> str | None:
        value = _Variant()
        key = _Key(_guid(FORMAT), pid)
        self._call(GET_VALUE, ctypes.addressof(key), ctypes.addressof(value))
        return value.text if value.type == VT_LPWSTR else None

    def set(self, pid: int, text: str) -> None:
        value = _Variant(type=VT_LPWSTR, text=text)
        key = _Key(_guid(FORMAT), pid)
        self._call(SET_VALUE, ctypes.addressof(key), ctypes.addressof(value))

    def commit(self) -> None:
        self._call(COMMIT)

    def close(self) -> None:
        self._call(RELEASE)


def _checked(code: int, pointer: ctypes.c_void_p) -> ctypes.c_void_p:
    if code < 0 or not pointer:
        raise OSError(code, "property store")
    return pointer


def mark_window(handle: int, command: str) -> bool:
    """False when the window is ours already."""
    store = Store.of_window(handle)
    try:
        if store.get(ID) == APP_ID:
            return False
        store.set(RELAUNCH_COMMAND, command)
        store.set(RELAUNCH_NAME, TITLE)
        store.set(RELAUNCH_ICON, f"{ICON},0")
        store.set(ID, APP_ID)  # last: the taskbar looks at the rest when the id changes
        store.commit()
        return True
    finally:
        store.close()


def mark_shortcut(path: Path) -> None:
    store = Store.of_file(path)
    try:
        store.set(ID, APP_ID)
        store.commit()
    finally:
        store.close()


def app_windows(window_class: str = WINDOW_CLASS, title: str = TITLE) -> list[int]:
    """Windows without tabs are titled by the page alone; a tab adds the name of the browser."""
    user = ctypes.WinDLL("user32")
    user.GetWindowTextW.argtypes = (ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int)
    user.GetClassNameW.argtypes = (ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int)
    user.IsWindowVisible.argtypes = (ctypes.c_void_p,)
    found: list[int] = []

    def visit(handle: int, _data: int) -> bool:
        text = ctypes.create_unicode_buffer(256)
        if user.IsWindowVisible(handle):
            user.GetClassNameW(handle, text, 256)
            if text.value == window_class:
                user.GetWindowTextW(handle, text, 256)
                if text.value == title:
                    found.append(handle)
        return True

    kind = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user.EnumWindows(kind(visit), None)
    return found


def adopt_windows(
    command: str,
    seconds: float = 15.0,
    windows: Callable[[], list[int]] = app_windows,
    mark: Callable[[int, str], bool] = mark_window,
) -> bool:
    """Waits for a new window and takes it in; a browser that says no is left as it is."""
    if sys.platform != "win32":
        return False
    ctypes.WinDLL("ole32").CoInitializeEx(None, 2)
    end = time.monotonic() + seconds
    while True:
        try:
            # All of them: an earlier window may have been left without the id.
            if any([mark(handle, command) for handle in windows()]):
                return True
        except OSError:
            return False
        if time.monotonic() > end:
            return False
        time.sleep(0.2)


def relaunch_command(arguments: list[str]) -> str:
    python = Path(sys.executable).with_name("pythonw.exe")
    return subprocess.list2cmdline([str(python), "-m", "orbit", *arguments])


if __name__ == "__main__":  # from shortcuts.ps1
    if os.name == "nt":
        ctypes.WinDLL("ole32").CoInitializeEx(None, 2)
        for name in sys.argv[1:]:
            mark_shortcut(Path(name))
