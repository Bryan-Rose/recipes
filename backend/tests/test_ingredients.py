from fastapi.testclient import TestClient

from app.schemas.ingredient import IngredientRead


def test_create_ingredient(client: TestClient):
    response = client.post("/ingredients/", json={"name": "butter"})

    assert response.status_code == 201
    ingredient = IngredientRead.model_validate(response.json())
    assert ingredient.name == "butter"


def test_list_ingredients_empty(client: TestClient):
    response = client.get("/ingredients/")

    assert response.status_code == 200
    assert response.json() == []


def test_get_ingredient(client: TestClient, ingredient: IngredientRead):
    response = client.get(f"/ingredients/{ingredient.id}")

    assert response.status_code == 200
    fetched = IngredientRead.model_validate(response.json())

    assert fetched == ingredient


def test_get_ingredient_not_found(client: TestClient):
    response = client.get("/ingredients/999")

    assert response.status_code == 404


def test_update_ingredient(client: TestClient, ingredient: IngredientRead):
    patch_response = client.patch(f"/ingredients/{ingredient.id}", json={"name": "minced garlic"})
    assert patch_response.status_code == 200

    response = client.get(f"/ingredients/{ingredient.id}")
    assert response.status_code == 200
    updated = IngredientRead.model_validate(response.json())
    assert updated.name == "minced garlic"


def test_delete_ingredient(client: TestClient, ingredient: IngredientRead):
    delete_response = client.delete(f"/ingredients/{ingredient.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/ingredients/{ingredient.id}")
    assert get_response.status_code == 404


def test_update_ingredient_not_found(client: TestClient):
    response = client.patch("/ingredients/999", json={"name": "garlic"})
    assert response.status_code == 404


def test_delete_ingredient_not_found(client: TestClient):
    response = client.delete("/ingredients/999")
    assert response.status_code == 404


def test_create_ingredient_requires_name(client: TestClient):
    create_response = client.post("/ingredients/")
    assert create_response.status_code == 422


def test_created_ingredient_appears_in_list(client: TestClient, ingredient: IngredientRead):
    response = client.get("/ingredients/")

    assert response.status_code == 200
    assert len(response.json()) == 1
    listed = IngredientRead.model_validate(response.json()[0])
    assert listed.name == "butter"
