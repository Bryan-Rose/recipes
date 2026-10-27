from fastapi.testclient import TestClient

from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead


def _recipe_ingredient(ingredient: IngredientRead, measurement: MeasurementRead, preparation: PreparationRead) -> dict:
    return {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "preparation_id": preparation.id, "amount": 1}


## Duplicates


def test_duplicate_name_is_a_conflict(client: TestClient, ingredient: IngredientRead):
    response = client.post("/ingredients/", json={"name": ingredient.name})

    assert response.status_code == 409
    assert response.json()["detail"] == "Already exists"
    assert client.get("/ingredients/").status_code == 200


def test_duplicate_recipe_name_is_a_conflict(client: TestClient):
    client.post("/recipes/", json={"name": "Ratatouille"})

    response = client.post("/recipes/", json={"name": "Ratatouille"})

    assert response.status_code == 409
    assert len(client.get("/recipes/").json()) == 1


## Deleting rows that are still referenced


def test_delete_ingredient_in_use_is_a_conflict(
    client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead, preparation: PreparationRead
):
    client.post("/recipes/", json={"name": "R", "recipe_ingredients": [_recipe_ingredient(ingredient, measurement, preparation)]})

    for path in (f"/ingredients/{ingredient.id}", f"/measurements/{measurement.id}", f"/preparations/{preparation.id}"):
        assert client.delete(path).status_code == 409
        assert client.get(path).status_code == 200


def test_delete_author_with_cookbooks_is_a_conflict(client: TestClient, author: AuthorRead, cookbook: CookbookRead):
    response = client.delete(f"/authors/{author.id}")

    assert response.status_code == 409
    assert response.json()["detail"] == "Still in use, or refers to something that doesn't exist"
    assert client.get(f"/authors/{author.id}").status_code == 200


def test_delete_cookbook_unlinks_its_recipes(client: TestClient, cookbook: CookbookRead):
    recipe = client.post("/recipes/", json={"name": "R", "cookbook_id": cookbook.id}).json()

    assert client.delete(f"/cookbooks/{cookbook.id}").status_code == 204
    assert client.get(f"/recipes/{recipe['id']}").json()["cookbook_id"] is None


## References to rows that don't exist


def test_recipe_with_unknown_cookbook_is_rejected(client: TestClient):
    response = client.post("/recipes/", json={"name": "R", "cookbook_id": 999})

    assert response.status_code == 409
    assert client.get("/recipes/").json() == []


def test_recipe_with_unknown_ingredient_is_rejected(client: TestClient, measurement: MeasurementRead, preparation: PreparationRead):
    ri = {"ingredient_id": 999, "measurement_id": measurement.id, "preparation_id": preparation.id, "amount": 1}

    response = client.post("/recipes/", json={"name": "R", "recipe_ingredients": [ri]})

    assert response.status_code == 409
    assert client.get("/recipes/").json() == []


def test_nested_recipe_ingredient_with_unknown_ingredient_is_rejected(
    client: TestClient, measurement: MeasurementRead, preparation: PreparationRead
):
    recipe = client.post("/recipes/", json={"name": "R"}).json()
    ri = {"ingredient_id": 999, "measurement_id": measurement.id, "preparation_id": preparation.id, "amount": 1}

    response = client.post(f"/recipes/{recipe['id']}/recipeingredients/", json=ri)

    assert response.status_code == 409
    assert client.get("/recipes/").status_code == 200


def test_cookbook_with_unknown_author_is_rejected(client: TestClient):
    response = client.post("/cookbooks/", json={"name": "Nobody's Book", "author_id": 999})

    assert response.status_code == 409
    assert response.json()["detail"] == "Still in use, or refers to something that doesn't exist"


## Values outside the safe integer range (found by fuzzing)

MAX_INT = 2**53 - 1  # app/schemas/fields.py; also keeps clear of SQLite's 2**63 overflow


def test_huge_path_id_is_rejected_not_crashed(client: TestClient):
    assert client.get(f"/recipes/{MAX_INT + 1}").status_code == 422
    assert client.get(f"/recipes/{MAX_INT}").status_code == 404


def test_huge_body_id_is_rejected_not_crashed(client: TestClient):
    response = client.post("/recipes/", json={"name": "R", "cookbook_id": MAX_INT + 1})

    assert response.status_code == 422


def test_non_positive_amount_is_rejected(
    client: TestClient, measurement: MeasurementRead, preparation: PreparationRead, ingredient: IngredientRead
):
    ri = {**_recipe_ingredient(ingredient, measurement, preparation), "amount": 0}

    assert client.post("/recipes/", json={"name": "R", "recipe_ingredients": [ri]}).status_code == 422
