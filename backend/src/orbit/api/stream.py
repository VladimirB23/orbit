"""Server-sent events: one line to the browser whenever the data has changed."""

from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.sse import EventSourceResponse, ServerSentEvent

from orbit.api.paths import API_V1
from orbit.api.routes import StateDep

router = APIRouter(prefix=API_V1)


@router.get("/stream", response_class=EventSourceResponse)
async def stream(state: StateDep) -> AsyncIterator[ServerSentEvent]:
    """The message carries no data: the client re-reads what it shows."""
    async for version in state.feed.versions():
        yield ServerSentEvent(event="change", data={"version": version})
