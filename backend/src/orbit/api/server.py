"""Running the app: loopback only, quick stop even with open event streams."""

import socket
from collections.abc import Callable
from contextlib import suppress

import uvicorn
from fastapi import FastAPI

HOST = "127.0.0.1"  # not configurable: there are no logins, so never listen outside


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
        self, config: uvicorn.Config, on_ready: Callable[[], object] | None = None
    ) -> None:
        super().__init__(config)
        self._on_ready = on_ready

    def stop(self) -> None:
        self.should_exit = True

    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets)
        if self.started and self._on_ready is not None:
            self._on_ready()

    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        # Event streams never end by themselves: without this, stopping waits for browsers.
        app = self.config.app
        assert isinstance(app, FastAPI)
        app.state.orbit.feed.close()
        await super().shutdown(sockets)


def run(app: FastAPI, port: int, on_ready: Callable[[], object] | None = None) -> None:
    # uvicorn repeats Ctrl+C after a clean stop; it has already done its job.
    with suppress(KeyboardInterrupt):
        OrbitServer(server_config(app, port), on_ready).run()


def port_is_free(port: int) -> bool:
    with socket.socket() as probe:
        # On Windows a plain bind may succeed on a port that is already in use.
        exclusive = getattr(socket, "SO_EXCLUSIVEADDRUSE", None)
        if exclusive is not None:
            probe.setsockopt(socket.SOL_SOCKET, exclusive, 1)
        try:
            probe.bind((HOST, port))
        except OSError:
            return False
    return True
