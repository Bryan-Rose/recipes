"""What imports now keep in fields of their own (#190): ingredient groups and line notes, and a recipe's author."""

import pytest
from fastapi.testclient import TestClient

from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.recipes import RecipeRead


@pytest.fixture()
def line(ingredient: IngredientRead, measurement: MeasurementRead):
    def make(**fields) -> dict:
        return {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": 2, **fields}

    return make


## Groups and notes


def test_line_keeps_its_group_and_note(client: TestClient, line):
    body = {"name": "Pancakes", "recipe_ingredients": [line(group="Batter", note="1-2 cups"), line()]}
    recipe_id = client.post("/recipes/", json=body).json()["id"]
    lines = client.get(f"/recipes/{recipe_id}").json()["recipe_ingredients"]
    assert [(row["group"], row["note"]) for row in lines] == [("Batter", "1-2 cups"), (None, None)]


def test_group_and_note_are_added_changed_and_cleared(client: TestClient, recipe: RecipeRead, line):
    created = client.post(f"/recipes/{recipe.id}/recipeingredients/", json=line(group=" Sauce ", note="optional"))
    assert created.status_code == 201
    assert (created.json()["group"], created.json()["note"]) == ("Sauce", "optional")
    path = f"/recipes/{recipe.id}/recipeingredients/{created.json()['id']}"

    changed = client.patch(path, json={"note": "plus more to serve"}).json()
    assert (changed["group"], changed["note"]) == ("Sauce", "plus more to serve")  # left out: kept
    cleared = client.patch(path, json={"group": None, "note": None}).json()
    assert (cleared["group"], cleared["note"]) == (None, None)


@pytest.mark.parametrize("field", ["group", "note"])
def test_blank_group_or_note_is_refused(client: TestClient, recipe: RecipeRead, line, field: str):
    """Blank means none, so the client sends null; a blank string would show as an empty heading or note."""
    assert client.post(f"/recipes/{recipe.id}/recipeingredients/", json=line(**{field: "  "})).status_code == 422


def test_shopping_list_sums_lines_whatever_their_group_or_note(client: TestClient, line):
    body = {"name": "Pie", "recipe_ingredients": [line(group="Crust"), line(group="Filling", note="about")]}
    recipe_id = client.post("/recipes/", json=body).json()["id"]
    client.put(f"/shopping-list/recipes/{recipe_id}", json={})
    (only,) = client.get("/shopping-list").json()["lines"]
    assert (only["amount_numerator"], only["amount_denominator"]) == (4, 1)


## Author


def test_recipe_without_a_cookbook_has_its_own_author(client: TestClient, author: AuthorRead):
    recipe_id = client.post("/recipes/", json={"name": "Shakshuka", "author_id": author.id}).json()["id"]
    assert client.get(f"/recipes/{recipe_id}").json()["author"] == {"id": author.id, "name": "Ina Garten"}
    (summary,) = client.get("/recipes/").json()
    assert summary["author_id"] == author.id


def test_author_and_cookbook_together_are_refused(client: TestClient, author: AuthorRead, cookbook: CookbookRead):
    response = client.post("/recipes/", json={"name": "Shakshuka", "author_id": author.id, "cookbook_id": cookbook.id})
    assert response.status_code == 422

    recipe_id = client.post("/recipes/", json={"name": "Shakshuka", "cookbook_id": cookbook.id}).json()["id"]
    response = client.patch(f"/recipes/{recipe_id}", json={"author_id": author.id})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "author_id"]


def test_giving_a_recipe_a_cookbook_drops_its_author(client: TestClient, author: AuthorRead, cookbook: CookbookRead):
    recipe_id = client.post("/recipes/", json={"name": "Shakshuka", "author_id": author.id}).json()["id"]
    updated = client.patch(f"/recipes/{recipe_id}", json={"cookbook_id": cookbook.id}).json()
    assert (updated["author"], updated["author_id"]) == (None, None)


def test_author_can_be_changed_and_cleared(client: TestClient, author: AuthorRead):
    other = client.post("/authors/", json={"name": "Ana Roux"}).json()["id"]
    recipe_id = client.post("/recipes/", json={"name": "Shakshuka", "author_id": author.id}).json()["id"]
    assert client.patch(f"/recipes/{recipe_id}", json={"author_id": other}).json()["author"]["name"] == "Ana Roux"
    assert client.patch(f"/recipes/{recipe_id}", json={"author_id": None}).json()["author"] is None


def test_author_of_a_recipe_cannot_be_deleted(client: TestClient, author: AuthorRead):
    client.post("/recipes/", json={"name": "Shakshuka", "author_id": author.id})
    assert client.delete(f"/authors/{author.id}").status_code == 409


def test_unknown_author_is_refused(client: TestClient):
    assert client.post("/recipes/", json={"name": "Shakshuka", "author_id": 999}).status_code == 409
