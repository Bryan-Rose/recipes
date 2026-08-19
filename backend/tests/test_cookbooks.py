from fastapi.testclient import TestClient

from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead


def test_create_cookbook(client: TestClient, author: AuthorRead):
    response = client.post("/cookbooks/", json={"name": "Some Cookbook", "author_id": author.id})

    assert response.status_code == 201
    cookbook = CookbookRead.model_validate(response.json())
    assert cookbook.name == "Some Cookbook"
    assert cookbook.author == author


def test_list_cookbooks_empty(client: TestClient):
    response = client.get("/cookbooks/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_cookbook(client: TestClient, cookbook: CookbookRead):
    response = client.get(f"/cookbooks/{cookbook.id}")

    assert response.status_code == 200
    fetched = CookbookRead.model_validate(response.json())

    assert fetched == cookbook


def test_get_cookbook_not_found(client: TestClient):
    response = client.get("/cookbooks/999")

    assert response.status_code == 404


def test_update_cookbook_name(client: TestClient, cookbook: CookbookRead):
    patch_response = client.patch(f"/cookbooks/{cookbook.id}", json={"name": "Some Cookbook"})
    assert patch_response.status_code == 200

    response = client.get(f"/cookbooks/{cookbook.id}")
    assert response.status_code == 200
    updated = CookbookRead.model_validate(response.json())
    assert updated.name == "Some Cookbook"
    assert updated.id == cookbook.id
    assert updated.author == cookbook.author


def test_delete_cookbook(client: TestClient, cookbook: CookbookRead):
    delete_response = client.delete(f"/cookbooks/{cookbook.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/cookbooks/{cookbook.id}")
    assert get_response.status_code == 404


def test_update_cookbook_not_found(client: TestClient):
    response = client.patch("/cookbooks/999", json={"name": "Another Cookbook"})
    assert response.status_code == 404


def test_delete_cookbook_not_found(client: TestClient):
    response = client.delete("/cookbooks/999")
    assert response.status_code == 404


def test_create_cookbook_requires_name(client: TestClient):
    create_response = client.post("/cookbooks/")
    assert create_response.status_code == 422


def test_created_cookbook_appears_in_list(client: TestClient, cookbook: CookbookRead):
    response = client.get("/cookbooks/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = CookbookRead.model_validate(response.json()[0])
    assert listed.name == "Mastering the Art of French Cooking"

