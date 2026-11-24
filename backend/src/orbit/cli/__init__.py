"""orbit command-line interface."""

import sys

from orbit.cli.app import app


def main() -> None:
    # Windows streams may default to an ANSI code page (cp1252) that cannot encode
    # Cyrillic; output is always UTF-8 so humans and agents read the same bytes.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    app()


__all__ = ["app", "main"]
