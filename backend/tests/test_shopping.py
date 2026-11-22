from fastapi.testclient import TestClient

from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead


def _recipe(client: TestClient, name: str, servings: int | None, ingredients: list[tuple[int, int, int, int]]) -> int:
    """ingredients: (ingredient_id, measurement_id, numerator, denominator)."""
    body = {
        "name": name,
        "servings": servings,
        "recipe_ingredients": [
            {"ingredient_id": i, "measurement_id": m, "amount_numerator": n, "amount_denominator": d} for i, m, n, d in ingredients
        ],
    }
    response = client.post("/recipes/", json=body)
    assert response.status_code == 201
    return response.json()["id"]


def _lines(client: TestClient) -> list[tuple[str, str, int, int, bool]]:
    response = client.get("/shopping-list")
    assert response.status_code == 200
    return [
        (line["ingredient"]["name"], line["measurement"]["name"], line["amount_numerator"], line["amount_denominator"], line["checked"])
        for line in response.json()["lines"]
    ]


def test_empty_list(client: TestClient):
    assert client.get("/shopping-list").json() == {"recipes": [], "lines": []}


def test_sums_by_ingredient_and_measurement(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    gram = client.post("/measurements/", json={"name": "gram"}).json()["id"]
    flour = client.post("/ingredients/", json={"name": "flour"}).json()["id"]
    a = _recipe(client, "Cake", None, [(ingredient.id, measurement.id, 1, 3), (flour, measurement.id, 2, 1)])
    b = _recipe(client, "Biscuits", None, [(ingredient.id, measurement.id, 1, 8), (ingredient.id, gram, 50, 1)])
    for recipe_id in (a, b):
        assert client.put(f"/shopping-list/recipes/{recipe_id}", json={}).status_code == 200

    # ⅓ + ⅛ cup stays exact as 11/24; grams stay a separate line. Sorted by ingredient, then measurement.
    assert _lines(client) == [
        ("butter", "cup", 11, 24, False),
        ("butter", "gram", 50, 1, False),
        ("flour", "cup", 2, 1, False),
    ]
    assert [r["name"] for r in client.get("/shopping-list").json()["recipes"]] == ["Biscuits", "Cake"]


def test_scales_by_servings_exactly(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    recipe_id = _recipe(client, "Cake", 4, [(ingredient.id, measurement.id, 1, 3)])
    response = client.put(f"/shopping-list/recipes/{recipe_id}", json={"servings": 6})
    assert response.json()["recipes"] == [{"recipe_id": recipe_id, "name": "Cake", "servings": 6, "recipe_servings": 4}]
    assert _lines(client) == [("butter", "cup", 1, 2, False)]  # ⅓ × 6/4

    # PUT again changes the servings rather than adding the recipe twice.
    client.put(f"/shopping-list/recipes/{recipe_id}", json={"servings": None})
    assert _lines(client) == [("butter", "cup", 1, 3, False)]
    assert len(client.get("/shopping-list").json()["recipes"]) == 1


def test_checks_and_adding_a_recipe_unchecks_its_lines(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    salt = client.post("/ingredients/", json={"name": "salt"}).json()["id"]
    a = _recipe(client, "Cake", None, [(ingredient.id, measurement.id, 1, 1), (salt, measurement.id, 1, 1)])
    b = _recipe(client, "Toast", None, [(ingredient.id, measurement.id, 1, 1)])
    client.put(f"/shopping-list/recipes/{a}", json={})
    for i in (ingredient.id, salt):
        assert client.put(f"/shopping-list/checks/{i}/{measurement.id}").status_code == 204
    assert client.put(f"/shopping-list/checks/{salt}/{measurement.id}").status_code == 204  # idempotent
    assert [line[4] for line in _lines(client)] == [True, True]

    # Toast needs more butter, so butter is to buy again; salt stays ticked.
    client.put(f"/shopping-list/recipes/{b}", json={})
    assert [(line[0], line[4]) for line in _lines(client)] == [("butter", False), ("salt", True)]

    assert client.delete(f"/shopping-list/checks/{salt}/{measurement.id}").status_code == 204
    assert client.delete(f"/shopping-list/checks/{salt}/{measurement.id}").status_code == 204
    assert [line[4] for line in _lines(client)] == [False, False]


def test_remove_and_clear(client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead):
    a = _recipe(client, "Cake", None, [(ingredient.id, measurement.id, 1, 1)])
    b = _recipe(client, "Toast", None, [])
    client.put(f"/shopping-list/recipes/{a}", json={})
    client.put(f"/shopping-list/recipes/{b}", json={})
    client.put(f"/shopping-list/checks/{ingredient.id}/{measurement.id}")

    assert client.delete(f"/shopping-list/recipes/{b}").status_code == 204
    assert client.delete(f"/shopping-list/recipes/{b}").status_code == 404
    assert [r["recipe_id"] for r in client.get("/shopping-list").json()["recipes"]] == [a]

    assert client.delete("/shopping-list").status_code == 204
    assert client.get("/shopping-list").json() == {"recipes": [], "lines": []}
    # The tick went with it: a line that appears later, by editing a listed recipe, starts unticked.
    client.put(f"/shopping-list/recipes/{b}", json={})
    body = {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": 1}
    assert client.post(f"/recipes/{b}/recipeingredients/", json=body).status_code == 201
    assert _lines(client) == [("butter", "cup", 1, 1, False)]


def test_unknown_recipe_or_lookup(client: TestClient, ingredient: IngredientRead):
    assert client.put("/shopping-list/recipes/999", json={}).status_code == 404
    assert client.put(f"/shopping-list/checks/{ingredient.id}/999").status_code == 409


def test_invalid_servings(client: TestClient, recipe):
    for servings in (0, True, 2**53):
        assert client.put(f"/shopping-list/recipes/{recipe.id}", json={"servings": servings}).status_code == 422


def test_deleting_a_recipe_or_lookup_is_not_blocked(client: TestClient, measurement: MeasurementRead):
    salt = client.post("/ingredients/", json={"name": "salt"}).json()["id"]
    recipe_id = _recipe(client, "Cake", None, [])
    client.put(f"/shopping-list/recipes/{recipe_id}", json={})
    client.put(f"/shopping-list/checks/{salt}/{measurement.id}")

    assert client.delete(f"/recipes/{recipe_id}").status_code == 204
    assert client.delete(f"/ingredients/{salt}").status_code == 204
    assert client.get("/shopping-list").json() == {"recipes": [], "lines": []}


def test_requires_login(client: TestClient):
    client.cookies.clear()
    assert client.get("/shopping-list").status_code == 401
