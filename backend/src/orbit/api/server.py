"""Running the app: loopback only, quick stop even with open event streams."""

import asyncio
import socket
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path
from uuid import uuid4

import uvicorn
from fastapi import FastAPI

from orbit.local import HOST, ask_to_stop

RUN_SECONDS = 0.5  # how often a server looks whether it is asked to stop


def server_config(app: FastAPI, port: int) -> uvicorn.Config:
    return uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
        server_header=False,
        timeout_graceful_shutdown=3,
    )


class OrbitServer(uvicorn.Server):
    def __init__(
        self,
        config: uvicorn.Config,
        on_ready: Callable[[], object] | None = None,
        mark: Path | None = None,
    ) -> None:
        super().__init__(config)
        self._on_ready = on_ready
        self._mark = mark
        self._token = uuid4().hex
        self._watch: asyncio.Task[None] | None = None

    def stop(self) -> None:
        self.should_exit = True

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets)
        if not self.started:
            return
        if self._mark is not None:
            self._mark.write_text(self._token, encoding="utf-8")
            self._watch = asyncio.create_task(self._watch_mark(self._mark))
        if self._on_ready is not None:
            self._on_ready()

    async def _watch_mark(self, mark: Path) -> None:
        """Taking the mark away is a request to stop: no address to call, nothing to kill."""
        while _read(mark) in (self._token, UNREADABLE):
            await asyncio.sleep(RUN_SECONDS)
        self.stop()

    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        # Event streams never end by themselves: without this, stopping waits for browsers.
        app = self.config.app
        assert isinstance(app, FastAPI)
        app.state.orbit.feed.close()
        if self._watch is not None:
            self._watch.cancel()
        await super().shutdown(sockets)
        if self._mark is not None and _read(self._mark) == self._token:
            ask_to_stop(self._mark)


UNREADABLE = ""


def _read(mark: Path) -> str | None:
    """None when there is no mark; a file that is busy for a moment is not a missing one."""
    try:
        return mark.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except OSError:
        return UNREADABLE


def run(
    app: FastAPI,
    port: int,
    on_ready: Callable[[], object] | None = None,
    mark: Path | None = None,
) -> None:
    # uvicorn repeats Ctrl+C after a clean stop; it has already done its job.
    with suppress(KeyboardInterrupt):
        OrbitServer(server_config(app, port), on_ready, mark).run()
