"""Application factory: API under /api/v1, the built UI everywhere else."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from orbit import __version__
from orbit.api import errors
from orbit.api.feed import ChangeFeed
from orbit.api.paths import API_V1
from orbit.api.routes import router
from orbit.api.security import LocalOnly
from orbit.api.state import AppState
from orbit.api.stream import router as stream_router
from orbit.api.ui import BuiltUI
from orbit.config import UI_DIR
from orbit.db.engine import ensure_schema, make_engine
from orbit.domain.clock import Clock, SystemClock


def create_app(db: Path, *, clock: Clock | None = None, ui: Path = UI_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        now = clock or SystemClock()
        engine = make_engine(db)
        try:
            ensure_schema(engine)
            feed = ChangeFeed(db, now)
            app.state.orbit = AppState(db=db, engine=engine, clock=now, feed=feed)
            poller = asyncio.create_task(feed.run())
            try:
                yield
            finally:
                feed.close()
                await poller
        finally:
            engine.dispose()

    app = FastAPI(
        title="Orbit",
        version=__version__,
        lifespan=lifespan,
        openapi_url=f"{API_V1}/openapi.json",
        # Swagger and ReDoc pages pull scripts from a CDN: keep the server self-contained.
        docs_url=None,
        redoc_url=None,
    )
    errors.install(app)
    app.include_router(router)
    app.include_router(stream_router)
    app.mount("/", BuiltUI(ui))
    app.add_middleware(LocalOnly)
    return app
