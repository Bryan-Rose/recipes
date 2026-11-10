"""The name-only lookups share one router (app/routers/lookups.py), so every
test runs against each of them."""

import pytest
from fastapi.testclient import TestClient

from app.schemas.lookup import LookupRead

PREFIXES = ["/authors", "/ingredients", "/measurements", "/preparations", "/tags"]


@pytest.fixture(params=PREFIXES)
def prefix(request: pytest.FixtureRequest) -> str:
    return request.param


@pytest.fixture()
def item(client: TestClient, prefix: str) -> LookupRead:
    response = client.post(f"{prefix}/", json={"name": "first"})
    assert response.status_code == 201
    return LookupRead.model_validate(response.json())


def test_create(client: TestClient, prefix: str):
    response = client.post(f"{prefix}/", json={"name": "first"})

    assert response.status_code == 201
    assert LookupRead.model_validate(response.json()).name == "first"


def test_create_requires_name(client: TestClient, prefix: str):
    assert client.post(f"{prefix}/").status_code == 422


def test_create_duplicate_name(client: TestClient, prefix: str, item: LookupRead):
    assert client.post(f"{prefix}/", json={"name": "first"}).status_code == 409


def test_duplicate_name_ignores_case(client: TestClient, prefix: str, item: LookupRead):
    assert client.post(f"{prefix}/", json={"name": "FIRST"}).status_code == 409


def test_update_to_duplicate_name(client: TestClient, prefix: str, item: LookupRead):
    other = client.post(f"{prefix}/", json={"name": "second"}).json()
    assert client.patch(f"{prefix}/{other['id']}", json={"name": "first"}).status_code == 409
    assert client.patch(f"{prefix}/{other['id']}", json={"name": "FIRST"}).status_code == 409


def test_update_to_own_name_in_another_case(client: TestClient, prefix: str, item: LookupRead):
    response = client.patch(f"{prefix}/{item.id}", json={"name": "First"})

    assert response.status_code == 200
    assert response.json()["name"] == "First"


def test_list_empty(client: TestClient, prefix: str):
    response = client.get(f"{prefix}/")

    assert response.status_code == 200
    assert response.json() == []


def test_created_appears_in_list(client: TestClient, prefix: str, item: LookupRead):
    response = client.get(f"{prefix}/")

    assert response.status_code == 200
    assert [LookupRead.model_validate(i) for i in response.json()] == [item]


def test_get(client: TestClient, prefix: str, item: LookupRead):
    response = client.get(f"{prefix}/{item.id}")

    assert response.status_code == 200
    assert LookupRead.model_validate(response.json()) == item


def test_update(client: TestClient, prefix: str, item: LookupRead):
    assert client.patch(f"{prefix}/{item.id}", json={"name": "second"}).status_code == 200

    response = client.get(f"{prefix}/{item.id}")
    assert response.status_code == 200
    assert LookupRead.model_validate(response.json()).name == "second"


def test_delete(client: TestClient, prefix: str, item: LookupRead):
    assert client.delete(f"{prefix}/{item.id}").status_code == 204
    assert client.get(f"{prefix}/{item.id}").status_code == 404


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_not_found(client: TestClient, prefix: str, method: str):
    response = client.request(method, f"{prefix}/999", json={"name": "x"} if method == "patch" else None)
    assert response.status_code == 404


def test_requires_login(client: TestClient, prefix: str):
    client.cookies.clear()
    assert client.get(f"{prefix}/").status_code == 401
