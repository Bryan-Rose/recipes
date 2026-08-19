from fastapi.testclient import TestClient

from app.schemas.recipes import RecipeRead, RequirementRead


def _create_requirement(client: TestClient, recipe_id: int, name: str) -> RequirementRead:
    response = client.post(f"/recipes/{recipe_id}/requirements/", json={"name": name})
    assert response.status_code == 201
    return RequirementRead.model_validate(response.json())


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


def test_list_requirements_empty(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/requirements/")

    assert response.status_code == 200
    assert response.json() == []


def test_list_requirements_is_scoped_to_its_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    mine = _create_requirement(client, recipe.id, "Dutch oven")
    _create_requirement(client, other.id, "Roasting pan")

    response = client.get(f"/recipes/{recipe.id}/requirements/")

    assert response.status_code == 200
    assert [RequirementRead.model_validate(row) for row in response.json()] == [mine]


def test_get_requirement(client: TestClient, recipe: RecipeRead):
    created = _create_requirement(client, recipe.id, "Dutch oven")

    response = client.get(f"/recipes/{recipe.id}/requirements/{created.id}")

    assert response.status_code == 200
    assert RequirementRead.model_validate(response.json()) == created


def test_get_requirement_not_found(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/requirements/999")

    assert response.status_code == 404


def test_get_requirement_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_requirement(client, recipe.id, "Dutch oven")

    response = client.get(f"/recipes/{other.id}/requirements/{created.id}")

    assert response.status_code == 404


def test_update_requirement(client: TestClient, recipe: RecipeRead):
    created = _create_requirement(client, recipe.id, "Dutch oven")

    patch_response = client.patch(
        f"/recipes/{recipe.id}/requirements/{created.id}", json={"name": "Heavy casserole"}
    )
    assert patch_response.status_code == 200

    response = client.get(f"/recipes/{recipe.id}/requirements/{created.id}")
    updated = RequirementRead.model_validate(response.json())
    assert updated.name == "Heavy casserole"
    assert updated.id == created.id


def test_update_requirement_not_found(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}/requirements/999", json={"name": "Nope"})

    assert response.status_code == 404


def test_update_requirement_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_requirement(client, recipe.id, "Dutch oven")

    response = client.patch(
        f"/recipes/{other.id}/requirements/{created.id}", json={"name": "Hijacked"}
    )

    assert response.status_code == 404


def test_delete_requirement(client: TestClient, recipe: RecipeRead):
    created = _create_requirement(client, recipe.id, "Dutch oven")

    delete_response = client.delete(f"/recipes/{recipe.id}/requirements/{created.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/recipes/{recipe.id}/requirements/{created.id}")
    assert get_response.status_code == 404


def test_delete_requirement_not_found(client: TestClient, recipe: RecipeRead):
    response = client.delete(f"/recipes/{recipe.id}/requirements/999")

    assert response.status_code == 404


def test_delete_requirement_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_requirement(client, recipe.id, "Dutch oven")

    delete_response = client.delete(f"/recipes/{other.id}/requirements/{created.id}")
    assert delete_response.status_code == 404

    assert client.get(f"/recipes/{recipe.id}/requirements/{created.id}").status_code == 200


def test_requirements_appear_on_the_parent_recipe(client: TestClient, recipe: RecipeRead):
    _create_requirement(client, recipe.id, "Dutch oven")

    response = client.get(f"/recipes/{recipe.id}")

    assert response.status_code == 200
    parent = RecipeRead.model_validate(response.json())
    assert [req.name for req in parent.requirements] == ["Dutch oven"]
