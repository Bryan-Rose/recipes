from fastapi.testclient import TestClient

from app.schemas.tag import TagRead


def test_create_tag(client: TestClient):
    response = client.post("/tags/", json={"name": "vegetarian"})

    assert response.status_code == 201
    tag = TagRead.model_validate(response.json())
    assert tag.name == "vegetarian"


def test_list_tags_empty(client: TestClient):
    response = client.get("/tags/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_tag(client: TestClient, tag: TagRead):
    response = client.get(f"/tags/{tag.id}")

    assert response.status_code == 200
    fetched = TagRead.model_validate(response.json())

    assert fetched == tag


def test_get_tag_not_found(client: TestClient):
    response = client.get("/tags/999")

    assert response.status_code == 404


def test_update_tag(client: TestClient, tag: TagRead):
    patch_response = client.patch(f"/tags/{tag.id}", json={"name": "vegan"})
    assert patch_response.status_code == 200

    response = client.get(f"/tags/{tag.id}")
    assert response.status_code == 200
    updated = TagRead.model_validate(response.json())
    assert updated.name == "vegan"


def test_delete_tag(client: TestClient, tag: TagRead):
    delete_response = client.delete(f"/tags/{tag.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/tags/{tag.id}")
    assert get_response.status_code == 404


def test_update_tag_not_found(client: TestClient):
    response = client.patch("/tags/999", json={"name": "vegetarian"})
    assert response.status_code == 404


def test_delete_tag_not_found(client: TestClient):
    response = client.delete("/tags/999")
    assert response.status_code == 404


def test_create_tag_requires_name(client: TestClient):
    create_response = client.post("/tags/")
    assert create_response.status_code == 422


def test_created_tag_appears_in_list(client: TestClient, tag: TagRead):
    response = client.get("/tags/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = TagRead.model_validate(response.json()[0])
    assert listed.name == "vegetarian"
