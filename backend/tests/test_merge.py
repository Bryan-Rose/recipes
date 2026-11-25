"""Merging a duplicate lookup into another (#192): every reference moves to the kept row, and the duplicate goes."""

import pytest
from fastapi.testclient import TestClient

from app.schemas.measurement import MeasurementRead


def _id(client: TestClient, kind: str, name: str) -> int:
    response = client.post(f"/{kind}/", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _line(ingredient: int, measurement: int, amount: int = 1, preparation: int | None = None) -> dict:
    return {"ingredient_id": ingredient, "measurement_id": measurement, "preparation_id": preparation, "amount_numerator": amount}


def _recipe(client: TestClient, name: str, **body) -> int:
    response = client.post("/recipes/", json={"name": name, **body})
    assert response.status_code == 201
    return response.json()["id"]


def _names(client: TestClient, kind: str) -> list[str]:
    return [row["name"] for row in client.get(f"/{kind}/").json()]


def test_merged_ingredient_is_one_line_on_recipes_and_the_shopping_list(client: TestClient, measurement: MeasurementRead):
    onion, onions = _id(client, "ingredients", "onion"), _id(client, "ingredients", "onions")
    soup = _recipe(client, "Soup", recipe_ingredients=[_line(onions, measurement.id, 2)])
    stew = _recipe(client, "Stew", recipe_ingredients=[_line(onion, measurement.id, 1)])
    for recipe_id in (soup, stew):
        client.put(f"/shopping-list/recipes/{recipe_id}", json={})
    assert len(client.get("/shopping-list").json()["lines"]) == 2

    response = client.post(f"/ingredients/{onions}/merge/{onion}")

    assert response.status_code == 200
    assert response.json() == {"id": onion, "name": "onion"}
    assert _names(client, "ingredients") == ["onion"]
    assert client.get(f"/recipes/{soup}").json()["recipe_ingredients"][0]["ingredient"]["name"] == "onion"
    (line,) = client.get("/shopping-list").json()["lines"]
    assert (line["ingredient"]["name"], line["amount_numerator"]) == ("onion", 3)


def test_merging_drops_the_duplicates_ticks(client: TestClient, measurement: MeasurementRead):
    onion, onions = _id(client, "ingredients", "onion"), _id(client, "ingredients", "onions")
    soup = _recipe(client, "Soup", recipe_ingredients=[_line(onions, measurement.id), _line(onion, measurement.id)])
    client.put(f"/shopping-list/recipes/{soup}", json={})
    for ingredient in (onion, onions):
        assert client.put(f"/shopping-list/checks/{ingredient}/{measurement.id}").status_code == 204

    assert client.post(f"/ingredients/{onions}/merge/{onion}").status_code == 200

    # The kept row's tick covered only its own amount, so the summed line is back to buy.
    (line,) = client.get("/shopping-list").json()["lines"]
    assert (line["amount_numerator"], line["checked"]) == (2, False)


def test_merging_measurements_and_preparations_repoints_lines(client: TestClient):
    salt = _id(client, "ingredients", "salt")
    tbsp, tablespoon = _id(client, "measurements", "tbsp"), _id(client, "measurements", "tablespoon")
    chopped, diced = _id(client, "preparations", "chopped"), _id(client, "preparations", "diced")
    recipe = _recipe(client, "Brine", recipe_ingredients=[_line(salt, tbsp, preparation=chopped)])

    assert client.post(f"/measurements/{tbsp}/merge/{tablespoon}").status_code == 200
    assert client.post(f"/preparations/{chopped}/merge/{diced}").status_code == 200

    (line,) = client.get(f"/recipes/{recipe}").json()["recipe_ingredients"]
    assert (line["measurement"]["name"], line["preparation"]["name"]) == ("tablespoon", "diced")
    assert "tbsp" not in _names(client, "measurements")
    assert "chopped" not in _names(client, "preparations")


def test_a_recipe_with_both_tags_keeps_one(client: TestClient):
    veg, vegetarian = _id(client, "tags", "veg"), _id(client, "tags", "vegetarian")
    both = _recipe(client, "Salad", tag_ids=[veg, vegetarian])
    one = _recipe(client, "Soup", tag_ids=[veg])

    assert client.post(f"/tags/{veg}/merge/{vegetarian}").status_code == 200

    for recipe_id in (both, one):
        assert [tag["name"] for tag in client.get(f"/recipes/{recipe_id}").json()["tags"]] == ["vegetarian"]
    assert _names(client, "tags") == ["vegetarian"]


def test_merging_authors_moves_their_cookbooks_and_recipes(client: TestClient):
    julia, child = _id(client, "authors", "Julia Child"), _id(client, "authors", "J. Child")
    book = client.post("/cookbooks/", json={"name": "Mastering", "author_id": child}).json()["id"]
    recipe = _recipe(client, "Omelette", author_id=child)

    assert client.post(f"/authors/{child}/merge/{julia}").status_code == 200

    assert client.get(f"/cookbooks/{book}").json()["author"]["name"] == "Julia Child"
    assert client.get(f"/recipes/{recipe}").json()["author"]["name"] == "Julia Child"
    assert _names(client, "authors") == ["Julia Child"]


def test_author_merge_refused_when_both_have_a_cookbook_of_that_name(client: TestClient):
    julia, child = _id(client, "authors", "Julia Child"), _id(client, "authors", "J. Child")
    for author in (julia, child):
        client.post("/cookbooks/", json={"name": "Mastering", "author_id": author})
    recipe = _recipe(client, "Omelette", author_id=child)

    assert client.post(f"/authors/{child}/merge/{julia}").status_code == 409

    # One transaction: nothing moved.
    assert sorted(_names(client, "authors")) == ["J. Child", "Julia Child"]
    assert client.get(f"/recipes/{recipe}").json()["author"]["name"] == "J. Child"


def test_merging_into_itself_is_refused(client: TestClient):
    onion = _id(client, "ingredients", "onion")
    response = client.post(f"/ingredients/{onion}/merge/{onion}")
    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Can't merge a row into itself"
    assert _names(client, "ingredients") == ["onion"]


@pytest.mark.parametrize("missing", ["item", "into"])
def test_merging_a_missing_row_is_404(client: TestClient, missing: str):
    onion = _id(client, "ingredients", "onion")
    path = f"/ingredients/999/merge/{onion}" if missing == "item" else f"/ingredients/{onion}/merge/999"
    assert client.post(path).status_code == 404
    assert _names(client, "ingredients") == ["onion"]


def test_merge_requires_login(client: TestClient):
    client.cookies.clear()
    assert client.post("/ingredients/1/merge/2").status_code == 401
