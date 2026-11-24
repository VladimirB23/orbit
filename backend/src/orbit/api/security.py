"""Protection for a login-free server on localhost.

Any page open in the browser can send requests to 127.0.0.1. Three checks stop it:
- Host must be a local name: otherwise a foreign domain resolved to 127.0.0.1
  (DNS rebinding) would look like our own origin;
- a write that names an Origin must come from our own page (CSRF);
- API requests a browser marks as cross-site are refused even for reading.
Programs without a browser (CLI, scripts, agents) send none of these headers.
"""

import json
import re

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from orbit.api.paths import API_ROOT

LOCAL_HOST_RE = re.compile(r"(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?")
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
OWN_SITES = frozenset({"same-origin", "none"})

PROTECTIVE_HEADERS = {
    "content-security-policy": "; ".join(
        (
            "default-src 'self'",
            "script-src 'self'",
            # Radix and Sonner position elements with inline styles
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        )
    ),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


def refusal_reason(scope: Scope) -> str | None:
    headers = Headers(scope=scope)
    host = headers.get("host", "")
    if not LOCAL_HOST_RE.fullmatch(host):
        return "orbit answers only on localhost"
    if not scope["path"].startswith(API_ROOT):
        return None
    if headers.get("sec-fetch-site", "none") not in OWN_SITES:
        return "request from another site"
    origin = headers.get("origin")
    if (
        scope["method"] not in SAFE_METHODS
        and origin is not None
        and origin != f"{scope['scheme']}://{host}"
    ):
        return "write from another origin"
    return None


class LocalOnly:
    """Pure ASGI middleware: does not buffer, so server-sent events pass through."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_protected(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in PROTECTIVE_HEADERS.items():
                    headers[name] = value
                if scope["path"].startswith(API_ROOT):
                    headers["cache-control"] = "no-store"
            await send(message)

        reason = refusal_reason(scope)
        if reason is None:
            await self.app(scope, receive, send_protected)
            return
        body = json.dumps({"error": {"type": "forbidden", "message": reason}}).encode()
        await send_protected(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send_protected({"type": "http.response.body", "body": body})
