from fastapi.testclient import TestClient

from app.schemas.recipes import RecipeRead, RequirementRead


def _create_requirement(client: TestClient, recipe_id: int, name: str) -> RequirementRead:
    response = client.post(f"/recipes/{recipe_id}/requirements/", json={"name": name})
    assert response.status_code == 201
    return RequirementRead.model_validate(response.json())


def _requirements(client: TestClient, recipe_id: int) -> list[RequirementRead]:
    return RecipeRead.model_validate(client.get(f"/recipes/{recipe_id}").json()).requirements


def test_create_requirement(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/requirements/", json={"name": "Dutch oven"})

    assert response.status_code == 201
    requirement = RequirementRead.model_validate(response.json())
    assert requirement.name == "Dutch oven"


def test_create_requirement_requires_name(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/requirements/", json={})

    assert response.status_code == 422


def test_create_requirement_for_unknown_recipe(client: TestClient):
    response = client.post("/recipes/999/requirements/", json={"name": "Dutch oven"})

    assert response.status_code == 404


def test_update_requirement(client: TestClient, recipe: RecipeRead):
    created = _create_requirement(client, recipe.id, "Dutch oven")

    patch_response = client.patch(f"/recipes/{recipe.id}/requirements/{created.id}", json={"name": "Heavy casserole"})
    assert patch_response.status_code == 200

    assert _requirements(client, recipe.id) == [created.model_copy(update={"name": "Heavy casserole"})]


def test_update_requirement_not_found(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}/requirements/999", json={"name": "Nope"})

    assert response.status_code == 404


def test_update_requirement_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_requirement(client, recipe.id, "Dutch oven")

    response = client.patch(f"/recipes/{other.id}/requirements/{created.id}", json={"name": "Hijacked"})

    assert response.status_code == 404


def test_delete_requirement(client: TestClient, recipe: RecipeRead):
    created = _create_requirement(client, recipe.id, "Dutch oven")

    delete_response = client.delete(f"/recipes/{recipe.id}/requirements/{created.id}")
    assert delete_response.status_code == 204

    assert _requirements(client, recipe.id) == []


def test_delete_requirement_not_found(client: TestClient, recipe: RecipeRead):
    response = client.delete(f"/recipes/{recipe.id}/requirements/999")

    assert response.status_code == 404


def test_delete_requirement_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_requirement(client, recipe.id, "Dutch oven")

    delete_response = client.delete(f"/recipes/{other.id}/requirements/{created.id}")
    assert delete_response.status_code == 404

    assert _requirements(client, recipe.id) == [created]


def test_requirements_appear_on_the_parent_recipe(client: TestClient, recipe: RecipeRead):
    _create_requirement(client, recipe.id, "Dutch oven")

    response = client.get(f"/recipes/{recipe.id}")

    assert response.status_code == 200
    parent = RecipeRead.model_validate(response.json())
    assert [req.name for req in parent.requirements] == ["Dutch oven"]
