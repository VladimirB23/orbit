"""Every failure has one shape: {"error": {"type", "message"}}."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException

from orbit.api.schemas import ErrorOut
from orbit.domain.errors import ConflictError, NotFoundError, OrbitError, ValidationError

STATUS_CODES: dict[type[OrbitError], tuple[int, str]] = {
    NotFoundError: (404, "not_found"),
    ConflictError: (409, "conflict"),
    ValidationError: (422, "validation"),
}

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorOut} for code in (403, 404, 409, 422, 503)
}


def error_response(code: int, kind: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"type": kind, "message": message}}, status_code=code)


def _describe(error: dict[str, Any]) -> str:
    where = ".".join(str(part) for part in error["loc"] if part != "body")
    return f"{where}: {error['msg']}" if where else str(error["msg"])


def install(app: FastAPI) -> None:
    @app.exception_handler(OrbitError)
    async def domain_error(_: Request, exc: OrbitError) -> JSONResponse:
        code, kind = next(
            (value for cls, value in STATUS_CODES.items() if isinstance(exc, cls)), (400, "error")
        )
        return error_response(code, kind, str(exc))

    @app.exception_handler(RequestValidationError)
    async def malformed(_: Request, exc: RequestValidationError) -> JSONResponse:
        message = "; ".join(_describe(dict(e)) for e in exc.errors())
        return error_response(422, "validation", message)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        kind = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "error")
        return error_response(exc.status_code, kind, str(exc.detail))

    @app.exception_handler(OperationalError)
    async def database_busy(_: Request, exc: OperationalError) -> JSONResponse:
        # Another process holds the write lock; nothing was saved.
        return error_response(503, "unavailable", f"database is unavailable: {exc.orig}")
