"""The built interface (frontend/dist) as static files."""

import mimetypes
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import PlainTextResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from orbit.api.paths import API_ROOT

# The Windows registry may call .js "text/plain", and browsers refuse such scripts.
for _type, _suffix in (
    ("text/javascript", ".js"),
    ("text/css", ".css"),
    ("image/svg+xml", ".svg"),
    ("font/woff2", ".woff2"),
):
    mimetypes.add_type(_type, _suffix)

NOT_BUILT = "The interface is not built yet. Run: cd frontend && npm install && npm run build\n"


class BuiltUI(StaticFiles):
    def __init__(self, root: Path) -> None:
        super().__init__(directory=root, html=True, check_dir=False)
        self.root = root
        self.config_checked = True  # a missing build is reported below, not raised

    async def get_response(self, path: str, scope: Scope) -> Response:
        if scope["path"].startswith(API_ROOT):
            raise HTTPException(404, "unknown API path")
        if not (self.root / "index.html").is_file():
            return PlainTextResponse(NOT_BUILT, status_code=503)
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            # A page address handled by the client-side router; files stay 404.
            if exc.status_code != 404 or Path(path).suffix:
                raise
            response = await super().get_response("index.html", scope)
        hashed = scope["path"].startswith("/assets/")
        response.headers["cache-control"] = (
            "public, max-age=31536000, immutable" if hashed else "no-cache"
        )
        return response
