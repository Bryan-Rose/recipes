"""Writes a browser marks as cross-site are refused (CSRF), whether or not logins are on."""

import pytest
from fastapi.testclient import TestClient


def _ingredient(client: TestClient, name: str) -> int:
    return client.post("/ingredients/", json={"name": name}).json()["id"]


def _names(client: TestClient) -> list[str]:
    return [row["name"] for row in client.get("/ingredients/").json()]


def test_cross_site_merge_is_refused(client: TestClient):
    onion, onions = _ingredient(client, "onion"), _ingredient(client, "onions")

    response = client.post(f"/ingredients/{onions}/merge/{onion}", headers={"Sec-Fetch-Site": "cross-site"})

    assert response.status_code == 403
    assert sorted(_names(client)) == ["onion", "onions"]


def test_cross_site_login_is_refused(client: TestClient):
    client.cookies.clear()

    response = client.post("/auth/login", json={"username": "admin", "password": "x"}, headers={"Sec-Fetch-Site": "cross-site"})

    assert response.status_code == 403


@pytest.mark.parametrize("headers", [{"Sec-Fetch-Site": "same-origin"}, {"Sec-Fetch-Site": "same-site"}, {"Sec-Fetch-Site": "none"}, {}])
def test_other_writes_pass(client: TestClient, headers: dict):
    response = client.post("/ingredients/", json={"name": "salt"}, headers=headers)

    assert response.status_code == 201


def test_cross_site_reads_pass(client: TestClient):
    assert client.get("/ingredients/", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 200
