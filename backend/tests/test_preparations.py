from fastapi.testclient import TestClient

from app.schemas.preparation import PreparationRead


def test_create_preparation(client: TestClient):
    response = client.post("/preparations/", json={"name": "melted"})

    assert response.status_code == 201
    preparation = PreparationRead.model_validate(response.json())
    assert preparation.name == "melted"


def test_list_preparations_empty(client: TestClient):
    response = client.get("/preparations/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_preparation(client: TestClient, preparation: PreparationRead):
    response = client.get(f"/preparations/{preparation.id}")

    assert response.status_code == 200
    fetched = PreparationRead.model_validate(response.json())

    assert fetched == preparation


def test_get_preparation_not_found(client: TestClient):
    response = client.get("/preparations/999")

    assert response.status_code == 404


def test_update_preparation(client: TestClient, preparation: PreparationRead):
    patch_response = client.patch(f"/preparations/{preparation.id}", json={"name": "minced"})
    assert patch_response.status_code == 200

    response = client.get(f"/preparations/{preparation.id}")
    assert response.status_code == 200
    updated = PreparationRead.model_validate(response.json())
    assert updated.name == "minced"


def test_delete_preparation(client: TestClient, preparation: PreparationRead):
    delete_response = client.delete(f"/preparations/{preparation.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/preparations/{preparation.id}")
    assert get_response.status_code == 404


def test_update_preparation_not_found(client: TestClient):
    response = client.patch("/preparations/999", json={"name": "melted"})
    assert response.status_code == 404


def test_delete_preparation_not_found(client: TestClient):
    response = client.delete("/preparations/999")
    assert response.status_code == 404


def test_create_preparation_requires_name(client: TestClient):
    create_response = client.post("/preparations/")
    assert create_response.status_code == 422


def test_created_preparation_appears_in_list(client: TestClient, preparation: PreparationRead):
    response = client.get("/preparations/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = PreparationRead.model_validate(response.json()[0])
    assert listed.name == "melted"
