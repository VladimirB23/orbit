"""No logins, so the browser is the threat: a foreign page must not reach the API."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from orbit.api.app import create_app

BASE = "http://localhost:8420"
NEW = {"slug": "a", "name": "A"}


@pytest.fixture
def client(db_file: Path) -> Iterator[TestClient]:
    with TestClient(create_app(db_file), base_url=BASE) as client:
        yield client


@pytest.mark.parametrize("host", ["localhost:8420", "127.0.0.1:8420", "127.0.0.1", "[::1]:8420"])
def test_local_hosts_are_allowed(client: TestClient, host: str) -> None:
    assert client.get("/api/v1/meta", headers={"host": host}).status_code == 200


@pytest.mark.parametrize(
    "host",
    ["evil.example", "localhost.evil.example", "192.168.1.5:8420", "", "localhost:8420@evil"],
)
def test_foreign_host_is_refused_against_dns_rebinding(client: TestClient, host: str) -> None:
    assert client.get("/api/v1/meta", headers={"host": host}).status_code == 403
    assert client.get("/", headers={"host": host}).status_code == 403


@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost:3000", "null"])
def test_write_from_a_foreign_page_is_refused(client: TestClient, origin: str) -> None:
    response = client.post("/api/v1/projects", json=NEW, headers={"origin": origin})
    assert response.status_code == 403
    assert response.json()["error"]["type"] == "forbidden"
    assert client.get("/api/v1/tree").json()["projects"] == []


def test_write_from_orbit_itself_is_allowed(client: TestClient) -> None:
    headers = {"origin": BASE, "sec-fetch-site": "same-origin"}
    assert client.post("/api/v1/projects", json=NEW, headers=headers).status_code == 201


def test_program_without_a_browser_is_allowed(client: TestClient) -> None:
    assert client.post("/api/v1/projects", json=NEW).status_code == 201


@pytest.mark.parametrize("site", ["cross-site", "same-site"])
def test_read_by_a_foreign_page_is_refused(client: TestClient, site: str) -> None:
    response = client.get("/api/v1/tree", headers={"sec-fetch-site": site})
    assert response.status_code == 403


def test_opening_orbit_by_a_link_from_another_site_works(client: TestClient) -> None:
    assert client.get("/", headers={"sec-fetch-site": "cross-site"}).status_code != 403


def test_plain_form_post_is_not_accepted_as_json(client: TestClient) -> None:
    response = client.post(
        "/api/v1/projects",
        content='{"slug":"a","name":"A"}',
        headers={"content-type": "text/plain"},
    )
    assert response.status_code == 422
    assert client.get("/api/v1/tree").json()["projects"] == []


@pytest.mark.parametrize("url", ["/", "/api/v1/meta", "/api/v1/nope"])
def test_every_response_carries_protective_headers(client: TestClient, url: str) -> None:
    headers = client.get(url).headers
    csp = headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cross-origin-resource-policy"] == "same-origin"
    assert "access-control-allow-origin" not in headers


def test_refusals_carry_protective_headers_too(client: TestClient) -> None:
    response = client.get("/api/v1/meta", headers={"host": "evil.example"})
    assert response.headers["x-content-type-options"] == "nosniff"


def test_api_answers_are_not_cached(client: TestClient) -> None:
    assert client.get("/api/v1/tree").headers["cache-control"] == "no-store"


def test_interactive_docs_that_load_foreign_scripts_are_off(client: TestClient) -> None:
    assert "swagger" not in client.get("/docs").text.lower()
