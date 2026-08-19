from fastapi.testclient import TestClient

from app.schemas.author import AuthorRead


def test_create_author(client: TestClient):
    response = client.post("/authors/", json={"name": "Ina Garten"})

    assert response.status_code == 201
    author = AuthorRead.model_validate(response.json())
    assert author.name == "Ina Garten"


def test_list_authors_empty(client: TestClient):
    response = client.get("/authors/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_author(client: TestClient, author: AuthorRead):
    response = client.get(f"/authors/{author.id}")

    assert response.status_code == 200
    fetched = AuthorRead.model_validate(response.json())

    assert fetched == author


def test_get_author_not_found(client: TestClient):
    response = client.get("/authors/999")

    assert response.status_code == 404


def test_update_author(client: TestClient, author: AuthorRead):
    patch_response = client.patch(f"/authors/{author.id}", json={"name": "Bobby Flay"})
    assert patch_response.status_code == 200

    response = client.get(f"/authors/{author.id}")
    assert response.status_code == 200
    updated = AuthorRead.model_validate(response.json())
    assert updated.name == "Bobby Flay"


def test_delete_author(client: TestClient, author: AuthorRead):
    delete_response = client.delete(f"/authors/{author.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/authors/{author.id}")
    assert get_response.status_code == 404


def test_update_author_not_found(client: TestClient):
    response = client.patch("/authors/999", json={"name": "Ina Garten"})
    assert response.status_code == 404


def test_delete_author_not_found(client: TestClient):
    response = client.delete("/authors/999")
    assert response.status_code == 404


def test_create_author_requires_name(client: TestClient):
    create_response = client.post("/authors/")
    assert create_response.status_code == 422


def test_created_author_appears_in_list(client: TestClient, author: AuthorRead):
    response = client.get("/authors/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = AuthorRead.model_validate(response.json()[0])
    assert listed.name == "Ina Garten"
