from fastapi.testclient import TestClient

from app.schemas.recipes import RecipeRead, StepRead


def _create_step(client: TestClient, recipe_id: int, text: str) -> StepRead:
    response = client.post(f"/recipes/{recipe_id}/steps/", json={"text": text})
    assert response.status_code == 201
    return StepRead.model_validate(response.json())


def test_create_step(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/steps/", json={"text": "Brown the beef."})

    assert response.status_code == 201
    step = StepRead.model_validate(response.json())
    assert step.text == "Brown the beef."


def test_create_step_requires_text(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/steps/", json={})

    assert response.status_code == 422


def test_create_step_for_unknown_recipe(client: TestClient):
    response = client.post("/recipes/999/steps/", json={"text": "Orphaned."})

    assert response.status_code == 404


def test_list_steps_empty(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/steps/")

    assert response.status_code == 200
    assert response.json() == []


def test_list_steps_preserves_insertion_order(client: TestClient, recipe: RecipeRead):
    _create_step(client, recipe.id, "Brown the beef.")
    _create_step(client, recipe.id, "Add the wine.")

    response = client.get(f"/recipes/{recipe.id}/steps/")

    assert response.status_code == 200
    listed = [StepRead.model_validate(row) for row in response.json()]
    assert [step.text for step in listed] == ["Brown the beef.", "Add the wine."]


def test_list_steps_is_scoped_to_its_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    mine = _create_step(client, recipe.id, "Brown the beef.")
    _create_step(client, other.id, "Brown the chicken.")

    response = client.get(f"/recipes/{recipe.id}/steps/")

    assert response.status_code == 200
    assert [StepRead.model_validate(row) for row in response.json()] == [mine]


def test_get_step(client: TestClient, recipe: RecipeRead):
    created = _create_step(client, recipe.id, "Brown the beef.")

    response = client.get(f"/recipes/{recipe.id}/steps/{created.id}")

    assert response.status_code == 200
    assert StepRead.model_validate(response.json()) == created


def test_get_step_not_found(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/steps/999")

    assert response.status_code == 404


def test_get_step_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    # get_step filters on recipe_id AND step_id, so a real step id addressed
    # through someone else's recipe must not leak.
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_step(client, recipe.id, "Brown the beef.")

    response = client.get(f"/recipes/{other.id}/steps/{created.id}")

    assert response.status_code == 404


def test_update_step(client: TestClient, recipe: RecipeRead):
    created = _create_step(client, recipe.id, "Brown the beef.")

    patch_response = client.patch(f"/recipes/{recipe.id}/steps/{created.id}", json={"text": "Sear the beef."})
    assert patch_response.status_code == 200

    response = client.get(f"/recipes/{recipe.id}/steps/{created.id}")
    updated = StepRead.model_validate(response.json())
    assert updated.text == "Sear the beef."
    assert updated.id == created.id


def test_update_step_not_found(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}/steps/999", json={"text": "Nope."})

    assert response.status_code == 404


def test_update_step_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_step(client, recipe.id, "Brown the beef.")

    response = client.patch(f"/recipes/{other.id}/steps/{created.id}", json={"text": "Hijacked."})

    assert response.status_code == 404


def test_delete_step(client: TestClient, recipe: RecipeRead):
    created = _create_step(client, recipe.id, "Brown the beef.")

    delete_response = client.delete(f"/recipes/{recipe.id}/steps/{created.id}")
    assert delete_response.status_code == 204

    get_response = client.get(f"/recipes/{recipe.id}/steps/{created.id}")
    assert get_response.status_code == 404


def test_delete_step_not_found(client: TestClient, recipe: RecipeRead):
    response = client.delete(f"/recipes/{recipe.id}/steps/999")

    assert response.status_code == 404


def test_delete_step_under_the_wrong_recipe(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create_step(client, recipe.id, "Brown the beef.")

    delete_response = client.delete(f"/recipes/{other.id}/steps/{created.id}")
    assert delete_response.status_code == 404

    # And the step is still there under its real parent.
    assert client.get(f"/recipes/{recipe.id}/steps/{created.id}").status_code == 200


def test_steps_appear_on_the_parent_recipe(client: TestClient, recipe: RecipeRead):
    _create_step(client, recipe.id, "Brown the beef.")

    response = client.get(f"/recipes/{recipe.id}")

    assert response.status_code == 200
    parent = RecipeRead.model_validate(response.json())
    assert [step.text for step in parent.steps] == ["Brown the beef."]


def _texts(client: TestClient, recipe_id: int) -> list[str]:
    return [StepRead.model_validate(row).text for row in client.get(f"/recipes/{recipe_id}/steps/").json()]


def test_reorder_steps(client: TestClient, recipe: RecipeRead):
    a, b, c = (_create_step(client, recipe.id, text) for text in ("A", "B", "C"))

    response = client.put(f"/recipes/{recipe.id}/step-order", json={"step_ids": [c.id, a.id, b.id]})

    assert response.status_code == 200
    assert [StepRead.model_validate(row).text for row in response.json()] == ["C", "A", "B"]
    assert _texts(client, recipe.id) == ["C", "A", "B"]
    parent = RecipeRead.model_validate(client.get(f"/recipes/{recipe.id}").json())
    assert [step.text for step in parent.steps] == ["C", "A", "B"]


def test_step_added_after_deletes_goes_last(client: TestClient, recipe: RecipeRead):
    a, b, _ = (_create_step(client, recipe.id, text) for text in ("A", "B", "C"))
    client.delete(f"/recipes/{recipe.id}/steps/{a.id}")
    client.delete(f"/recipes/{recipe.id}/steps/{b.id}")

    _create_step(client, recipe.id, "D")

    assert _texts(client, recipe.id) == ["C", "D"]


def test_reorder_steps_rejects_an_incomplete_or_foreign_list(client: TestClient, recipe: RecipeRead):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    a, b = (_create_step(client, recipe.id, text) for text in ("A", "B"))
    foreign = _create_step(client, other.id, "X")

    for step_ids in ([a.id], [a.id, a.id], [a.id, b.id, foreign.id], [a.id, foreign.id]):
        response = client.put(f"/recipes/{recipe.id}/step-order", json={"step_ids": step_ids})
        assert response.status_code == 409, step_ids

    assert _texts(client, recipe.id) == ["A", "B"]


def test_reorder_steps_for_unknown_recipe(client: TestClient):
    response = client.put("/recipes/999/step-order", json={"step_ids": []})

    assert response.status_code == 404
