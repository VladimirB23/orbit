"""The interface is compiled against frontend/openapi.json: it must match the real API."""

import json
from pathlib import Path

from orbit.api.app import create_app
from orbit.config import REPO_ROOT

SNAPSHOT = REPO_ROOT / "frontend" / "openapi.json"


def test_frontend_types_are_generated_from_the_current_api(tmp_path: Path) -> None:
    current = create_app(tmp_path / "any.db").openapi()
    saved = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert saved == json.loads(json.dumps(current)), (
        "API has changed: run `npm run gen:api` in frontend and fix what the compiler shows"
    )
