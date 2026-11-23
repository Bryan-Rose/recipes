from fastapi.testclient import TestClient

from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead

WEEK = {"start": "2026-11-23", "end": "2026-11-29"}


def _recipe(client: TestClient, name: str, servings: int | None, ingredient: IngredientRead, measurement: MeasurementRead) -> int:
    body = {
        "name": name,
        "servings": servings,
        "recipe_ingredients": [
            {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": 1, "amount_denominator": 1}
        ],
    }
    return client.post("/recipes/", json=body).json()["id"]


def _plan(client: TestClient, recipe_id: int, day: str, servings: int | None = None) -> dict:
    response = client.post("/meal-plan/meals", json={"recipe_id": recipe_id, "day": day, "servings": servings})
    assert response.status_code == 201
    return response.json()


def test_plan_lists_a_range_by_day(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    cake = _recipe(client, "Cake", 4, ingredient, measurement)
    toast = _recipe(client, "Toast", None, ingredient, measurement)
    tuesday = _plan(client, toast, "2026-11-24")
    monday = _plan(client, cake, "2026-11-23", 6)
    _plan(client, cake, "2026-11-30")  # next week
    assert monday == {"id": monday["id"], "day": "2026-11-23", "recipe_id": cake, "name": "Cake", "servings": 6, "recipe_servings": 4}

    response = client.get("/meal-plan/meals", params=WEEK)
    assert response.status_code == 200
    assert [(m["day"], m["name"]) for m in response.json()] == [("2026-11-23", "Cake"), ("2026-11-24", "Toast")]

    assert client.put(f"/meal-plan/meals/{monday['id']}", json={"servings": None}).json()["servings"] is None
    assert client.delete(f"/meal-plan/meals/{tuesday['id']}").status_code == 204
    assert [m["name"] for m in client.get("/meal-plan/meals", params=WEEK).json()] == ["Cake"]


def test_missing_rows_are_404(client: TestClient):
    assert client.post("/meal-plan/meals", json={"recipe_id": 999, "day": "2026-11-23"}).status_code == 404
    assert client.put("/meal-plan/meals/999", json={}).status_code == 404
    assert client.delete("/meal-plan/meals/999").status_code == 404


def test_deleting_a_recipe_takes_it_off_the_plan(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    cake = _recipe(client, "Cake", 4, ingredient, measurement)
    _plan(client, cake, "2026-11-23")
    assert client.delete(f"/recipes/{cake}").status_code == 204
    assert client.get("/meal-plan/meals", params=WEEK).json() == []


def test_shop_adds_the_weeks_servings_to_the_list(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    cake = _recipe(client, "Cake", 4, ingredient, measurement)
    soup = _recipe(client, "Soup", 2, ingredient, measurement)
    toast = _recipe(client, "Toast", None, ingredient, measurement)
    _plan(client, cake, "2026-11-23")  # as written: 4
    _plan(client, cake, "2026-11-25", 2)
    _plan(client, soup, "2026-11-29", 3)
    _plan(client, toast, "2026-11-24")
    _plan(client, toast, "2026-11-26")
    _plan(client, soup, "2026-11-30")  # next week, not shopped
    client.put(f"/shopping-list/recipes/{soup}", json={})  # already listed, as written: 2

    response = client.post("/meal-plan/shop", json=WEEK)
    assert response.status_code == 200
    assert [(r["name"], r["servings"]) for r in response.json()["recipes"]] == [("Cake", 6), ("Soup", 5), ("Toast", None)]
    # Cake 6/4 + Soup 5/2 + Toast once.
    assert [(line["amount_numerator"], line["amount_denominator"]) for line in response.json()["lines"]] == [(5, 1)]

    # The plan is left as it was.
    assert len(client.get("/meal-plan/meals", params=WEEK).json()) == 5


def test_shop_an_empty_range_changes_nothing(client: TestClient):
    assert client.post("/meal-plan/shop", json=WEEK).json() == {"recipes": [], "lines": []}


def test_days_must_be_iso_dates(client: TestClient):
    # Lax pydantic would read 0 as the Unix epoch.
    assert client.post("/meal-plan/shop", json={"start": "2026-11-23", "end": 0}).status_code == 422
    assert client.post("/meal-plan/meals", json={"recipe_id": 1, "day": 0}).status_code == 422
