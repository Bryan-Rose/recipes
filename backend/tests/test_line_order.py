"""Ingredient lines and requirements keep an order and can be reordered, like steps (tests/test_steps.py)."""

import pytest
from fastapi.testclient import TestClient

from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.recipes import RecipeRead

# (route under the recipe, order route, ids field, recipe field, the label each test line carries)
KINDS = [
    pytest.param(("requirements", "requirement-order", "requirement_ids", "requirements"), id="requirements"),
    pytest.param(("recipeingredients", "ingredient-order", "recipe_ingredient_ids", "recipe_ingredients"), id="ingredients"),
]


@pytest.fixture()
def line(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    """Adds a line labelled by a number: a requirement named "3", or an ingredient line of amount 3."""

    def add(kind: tuple, recipe_id: int, label: int) -> int:
        route = kind[0]
        body = (
            {"name": str(label)}
            if route == "requirements"
            else {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": label}
        )
        response = client.post(f"/recipes/{recipe_id}/{route}/", json=body)
        assert response.status_code == 201
        return response.json()["id"]

    return add


def _labels(rows: list[dict]) -> list[int]:
    return [int(row["name"]) if "name" in row else row["amount_numerator"] for row in rows]


def _shown(client: TestClient, kind: tuple, recipe_id: int) -> list[int]:
    return _labels(client.get(f"/recipes/{recipe_id}").json()[kind[3]])


@pytest.mark.parametrize("kind", KINDS)
def test_reorder(client: TestClient, recipe: RecipeRead, line, kind: tuple):
    a, b, c = (line(kind, recipe.id, label) for label in (1, 2, 3))

    response = client.put(f"/recipes/{recipe.id}/{kind[1]}", json={kind[2]: [c, a, b]})

    assert response.status_code == 200
    assert _labels(response.json()) == [3, 1, 2]
    assert _shown(client, kind, recipe.id) == [3, 1, 2]


@pytest.mark.parametrize("kind", KINDS)
def test_line_added_after_deletes_goes_last(client: TestClient, recipe: RecipeRead, line, kind: tuple):
    a, b, _ = (line(kind, recipe.id, label) for label in (1, 2, 3))
    # Leaves line 3 at position 2, above the count of lines a plain append would number the next one with.
    client.delete(f"/recipes/{recipe.id}/{kind[0]}/{b}")
    client.delete(f"/recipes/{recipe.id}/{kind[0]}/{a}")

    line(kind, recipe.id, 4)

    assert _shown(client, kind, recipe.id) == [3, 4]


@pytest.mark.parametrize("kind", KINDS)
def test_reorder_rejects_an_incomplete_or_foreign_list(client: TestClient, recipe: RecipeRead, line, kind: tuple):
    other = client.post("/recipes/", json={"name": "Coq au Vin"}).json()["id"]
    a, b = (line(kind, recipe.id, label) for label in (1, 2))
    foreign = line(kind, other, 9)

    for ids in ([a], [a, a], [a, b, foreign], [a, foreign]):
        response = client.put(f"/recipes/{recipe.id}/{kind[1]}", json={kind[2]: ids})
        assert response.status_code == 409, ids
        assert "exactly once" in response.json()["detail"]

    assert _shown(client, kind, recipe.id) == [1, 2]


@pytest.mark.parametrize("kind", KINDS)
def test_reorder_for_unknown_recipe(client: TestClient, kind: tuple):
    assert client.put(f"/recipes/999/{kind[1]}", json={kind[2]: []}).status_code == 404


def test_nested_create_keeps_the_order_sent(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    lines = [{"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": n} for n in (3, 1, 2)]
    body = {"name": "Stew", "recipe_ingredients": lines, "requirements": [{"name": n} for n in ("3", "1", "2")]}
    recipe_id = client.post("/recipes/", json=body).json()["id"]
    detail = client.get(f"/recipes/{recipe_id}").json()
    assert _labels(detail["recipe_ingredients"]) == [3, 1, 2]
    assert _labels(detail["requirements"]) == [3, 1, 2]
