"""Required names and texts are trimmed, and blank ones are a 422 (#74)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.recipe import Tag
from app.schemas.cookbook import CookbookRead
from app.schemas.recipes import RecipeRead
from app.schemas.user import UserRead

BLANKS = ["", "   ", "\t\n"]


@pytest.fixture()
def writes(client: TestClient, recipe: RecipeRead, cookbook: CookbookRead, user: UserRead):
    """(method, path, body without the field, field) for every write that takes a required name or text."""
    step = client.post(f"/recipes/{recipe.id}/steps/", json={"text": "Stir."}).json()
    requirement = client.post(f"/recipes/{recipe.id}/requirements/", json={"name": "Pot"}).json()
    lookups = ["authors", "ingredients", "measurements", "preparations", "tags"]
    return [
        ("post", "/recipes/", {}, "name"),
        ("patch", f"/recipes/{recipe.id}", {}, "name"),
        ("post", f"/recipes/{recipe.id}/steps/", {}, "text"),
        ("patch", f"/recipes/{recipe.id}/steps/{step['id']}", {}, "text"),
        ("post", f"/recipes/{recipe.id}/requirements/", {}, "name"),
        ("patch", f"/recipes/{recipe.id}/requirements/{requirement['id']}", {}, "name"),
        ("post", "/cookbooks/", {"author_id": cookbook.author.id}, "name"),
        ("patch", f"/cookbooks/{cookbook.id}", {}, "name"),
        ("post", "/users/", {"full_name": "Julia Child", "password": "s3cret-pw"}, "username"),
        ("post", "/users/", {"username": "julia", "password": "s3cret-pw"}, "full_name"),
        ("patch", f"/users/{user.id}", {}, "full_name"),
        *[("post", f"/{name}/", {}, "name") for name in lookups],
        *[("patch", f"/{name}/{client.post(f'/{name}/', json={'name': 'x'}).json()['id']}", {}, "name") for name in lookups],
    ]


@pytest.mark.parametrize("blank", BLANKS)
def test_blank_is_rejected(client: TestClient, writes, blank: str):
    for method, path, body, field in writes:
        response = client.request(method, path, json={**body, field: blank})
        assert response.status_code == 422, (method, path, field)


@pytest.mark.parametrize("blank", BLANKS)
def test_blank_nested_in_recipe_create_is_rejected(client: TestClient, blank: str):
    assert client.post("/recipes/", json={"name": "Stew", "steps": [{"text": blank}]}).status_code == 422
    assert client.post("/recipes/", json={"name": "Stew", "requirements": [{"name": blank}]}).status_code == 422


def test_names_are_trimmed(client: TestClient):
    assert client.post("/tags/", json={"name": "  Vegan \n"}).json()["name"] == "Vegan"
    assert client.post("/recipes/", json={"name": " Stew "}).json()["name"] == "Stew"


def test_blank_rows_saved_before_the_rule_still_load(client: TestClient, db_session: Session):
    db_session.add(Tag(name=""))
    db_session.commit()
    response = client.get("/tags/")
    assert response.status_code == 200
    assert "" in [tag["name"] for tag in response.json()]
