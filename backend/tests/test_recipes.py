from fastapi.testclient import TestClient

from app.models.user import User
from app.schemas.cookbook import CookbookRead
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.recipes import RecipeRead
from app.schemas.tag import TagRead


def test_create_recipe(client: TestClient):
    response = client.post("/recipes/", json={"name": "Ratatouille"})

    assert response.status_code == 201
    recipe = RecipeRead.model_validate(response.json())
    assert recipe.name == "Ratatouille"
    assert recipe.cookbook is None
    assert recipe.steps == []
    assert recipe.requirements == []
    assert recipe.recipe_ingredients == []
    assert recipe.created_at is not None
    assert recipe.updated_at is not None


def test_create_recipe_is_attributed_to_current_user(client: TestClient, current_user: User):
    response = client.post("/recipes/", json={"name": "Ratatouille"})

    assert response.status_code == 201
    recipe = RecipeRead.model_validate(response.json())
    assert recipe.created_user_id == current_user.id


def test_create_recipe_with_cookbook(client: TestClient, cookbook: CookbookRead):
    response = client.post(
        "/recipes/",
        json={"name": "Boeuf en Daube", "cookbook_id": cookbook.id, "cookbook_page": 315},
    )

    assert response.status_code == 201
    recipe = RecipeRead.model_validate(response.json())
    assert recipe.cookbook == cookbook
    assert recipe.cookbook_page == 315


def test_create_recipe_with_nested_children(
    client: TestClient,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    response = client.post(
        "/recipes/",
        json={
            "name": "Coq au Vin",
            "steps": [{"text": "Brown the chicken."}, {"text": "Add the wine."}],
            "requirements": [{"name": "Dutch oven"}],
            "recipe_ingredients": [
                {
                    "ingredient_id": ingredient.id,
                    "measurement_id": measurement.id,
                    "preparation_id": preparation.id,
                    "amount": 3,
                }
            ],
        },
    )

    assert response.status_code == 201
    recipe = RecipeRead.model_validate(response.json())

    assert [step.text for step in recipe.steps] == ["Brown the chicken.", "Add the wine."]
    assert [req.name for req in recipe.requirements] == ["Dutch oven"]

    (recipe_ingredient,) = recipe.recipe_ingredients
    assert recipe_ingredient.ingredient == ingredient
    assert recipe_ingredient.measurement == measurement
    assert recipe_ingredient.preparation == preparation
    assert recipe_ingredient.amount == 3


def test_create_recipe_requires_name(client: TestClient):
    response = client.post("/recipes/", json={})

    assert response.status_code == 422


def test_list_recipes_empty(client: TestClient):
    response = client.get("/recipes/")

    assert response.status_code == 200
    assert response.json() == []


def test_created_recipe_appears_in_list(client: TestClient, recipe: RecipeRead):
    response = client.get("/recipes/")

    assert response.status_code == 200
    assert [RecipeRead.model_validate(row) for row in response.json()] == [recipe]


def test_get_recipe(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}")

    assert response.status_code == 200
    fetched = RecipeRead.model_validate(response.json())

    assert fetched == recipe


def test_get_recipe_not_found(client: TestClient):
    response = client.get("/recipes/999")

    assert response.status_code == 404


def test_update_recipe(client: TestClient, recipe: RecipeRead):
    patch_response = client.patch(f"/recipes/{recipe.id}", json={"servings": "8"})
    assert patch_response.status_code == 200

    response = client.get(f"/recipes/{recipe.id}")
    assert response.status_code == 200
    updated = RecipeRead.model_validate(response.json())

    assert updated.servings == "8"
    # RecipeUpdate is all-optional and the service relies on exclude_unset, so
    # the fields we did not send must survive untouched.
    assert updated.name == recipe.name
    assert updated.cookbook_page == recipe.cookbook_page


def test_update_recipe_preserves_cookbook(client: TestClient, cookbook: CookbookRead):
    created = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Cassoulet", "cookbook_id": cookbook.id}).json())

    patch_response = client.patch(f"/recipes/{created.id}", json={"servings": "6"})
    assert patch_response.status_code == 200

    updated = RecipeRead.model_validate(patch_response.json())
    assert updated.cookbook == cookbook


def test_update_recipe_can_clear_cookbook(client: TestClient, cookbook: CookbookRead):
    created = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Pot au Feu", "cookbook_id": cookbook.id}).json())
    assert created.cookbook is not None

    # An explicit null IS "set", so exclude_unset keeps it and the FK is cleared.
    patch_response = client.patch(f"/recipes/{created.id}", json={"cookbook_id": None})
    assert patch_response.status_code == 200

    updated = RecipeRead.model_validate(patch_response.json())
    assert updated.cookbook is None


def test_update_recipe_preserves_children(client: TestClient, recipe: RecipeRead):
    client.post(f"/recipes/{recipe.id}/steps/", json={"text": "Simmer for three hours."})

    patch_response = client.patch(f"/recipes/{recipe.id}", json={"name": "Beef Burgundy"})
    assert patch_response.status_code == 200

    response = client.get(f"/recipes/{recipe.id}")
    updated = RecipeRead.model_validate(response.json())

    assert updated.name == "Beef Burgundy"
    assert [step.text for step in updated.steps] == ["Simmer for three hours."]


def test_update_recipe_not_found(client: TestClient):
    response = client.patch("/recipes/999", json={"name": "Nope"})

    assert response.status_code == 404


def test_delete_recipe(client: TestClient, recipe: RecipeRead):
    delete_response = client.delete(f"/recipes/{recipe.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/recipes/{recipe.id}")
    assert get_response.status_code == 404


def test_delete_recipe_with_children(client: TestClient):
    created = client.post(
        "/recipes/",
        json={
            "name": "Coq au Vin",
            "steps": [{"text": "Brown the chicken."}],
            "requirements": [{"name": "Dutch oven"}],
        },
    ).json()

    response = client.delete(f"/recipes/{created['id']}")

    assert response.status_code == 204


def test_delete_recipe_not_found(client: TestClient):
    response = client.delete("/recipes/999")

    assert response.status_code == 404


def test_create_recipe_with_tags(client: TestClient, tag: TagRead):
    response = client.post("/recipes/", json={"name": "Ratatouille", "tag_ids": [tag.id]})

    assert response.status_code == 201
    assert RecipeRead.model_validate(response.json()).tags == [tag]


def test_create_recipe_with_unknown_tag(client: TestClient):
    response = client.post("/recipes/", json={"name": "Ratatouille", "tag_ids": [999]})

    assert response.status_code == 409
    assert client.get("/recipes/").json() == []


def test_update_recipe_replaces_tags(client: TestClient, recipe: RecipeRead, tag: TagRead):
    other = TagRead.model_validate(client.post("/tags/", json={"name": "weeknight"}).json())
    client.patch(f"/recipes/{recipe.id}", json={"tag_ids": [tag.id]})

    response = client.patch(f"/recipes/{recipe.id}", json={"tag_ids": [other.id]})

    assert response.status_code == 200
    assert RecipeRead.model_validate(response.json()).tags == [other]


def test_update_recipe_without_tag_ids_keeps_tags(client: TestClient, recipe: RecipeRead, tag: TagRead):
    client.patch(f"/recipes/{recipe.id}", json={"tag_ids": [tag.id]})

    response = client.patch(f"/recipes/{recipe.id}", json={"name": "Boeuf Bourguignon"})

    assert RecipeRead.model_validate(response.json()).tags == [tag]


def test_update_recipe_with_unknown_tag(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}", json={"tag_ids": [999]})

    assert response.status_code == 409


def test_delete_tag_removes_it_from_recipes(client: TestClient, recipe: RecipeRead, tag: TagRead):
    client.patch(f"/recipes/{recipe.id}", json={"tag_ids": [tag.id]})

    assert client.delete(f"/tags/{tag.id}").status_code == 204
    assert client.get(f"/recipes/{recipe.id}").json()["tags"] == []


def test_timestamps_carry_a_utc_offset(client: TestClient, recipe: RecipeRead):
    # Without an offset, browsers parse the value as local time.
    body = client.get(f"/recipes/{recipe.id}").json()

    assert body["created_at"].endswith("Z") or body["created_at"].endswith("+00:00")
    assert body["updated_at"].endswith("Z") or body["updated_at"].endswith("+00:00")
