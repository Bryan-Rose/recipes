import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recipe import RecipeIngredient
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.recipes import RecipeIngredientRead, RecipeRead

PREFIX = "recipeingredients"


def _payload(
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
    amount: int = 3,
) -> dict:
    return {
        "ingredient_id": ingredient.id,
        "measurement_id": measurement.id,
        "preparation_id": preparation.id,
        "amount_numerator": amount,
    }


def _create(client: TestClient, recipe_id: int, payload: dict) -> RecipeIngredientRead:
    response = client.post(f"/recipes/{recipe_id}/{PREFIX}/", json=payload)
    assert response.status_code == 201
    return RecipeIngredientRead.model_validate(response.json())


def _ingredients(client: TestClient, recipe_id: int) -> list[RecipeIngredientRead]:
    return RecipeRead.model_validate(client.get(f"/recipes/{recipe_id}").json()).recipe_ingredients


def _only_id(db_session: Session, recipe_id: int) -> int:
    """Read the row id straight from the database.

    RecipeIngredientRead exposes no `id`, but the routes are addressed by one,
    so there is no way to learn it through the API. Until the schema grows an
    `id` field, the tests have to reach past the API to address a row.
    """
    return db_session.execute(select(RecipeIngredient.id).where(RecipeIngredient.recipe_id == recipe_id)).scalars().one()


def test_create_recipe_ingredient(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    response = client.post(
        f"/recipes/{recipe.id}/{PREFIX}/",
        json=_payload(ingredient, measurement, preparation, amount=3),
    )

    assert response.status_code == 201
    created = RecipeIngredientRead.model_validate(response.json())
    # Three foreign keys go in; three fully resolved objects come back.
    assert created.ingredient == ingredient
    assert created.measurement == measurement
    assert created.preparation == preparation
    assert (created.amount_numerator, created.amount_denominator) == (3, 1)


def test_create_recipe_ingredient_requires_all_ids(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/{PREFIX}/", json={"amount_numerator": 3})

    assert response.status_code == 422


def test_create_recipe_ingredient_for_unknown_recipe(
    client: TestClient,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    response = client.post(f"/recipes/999/{PREFIX}/", json=_payload(ingredient, measurement, preparation))

    assert response.status_code == 404


def test_update_recipe_ingredient_amount(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    _create(client, recipe.id, _payload(ingredient, measurement, preparation, amount=3))
    ri_id = _only_id(db_session, recipe.id)

    patch_response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}", json={"amount_numerator": 8})
    assert patch_response.status_code == 200

    [updated] = _ingredients(client, recipe.id)
    assert (updated.amount_numerator, updated.amount_denominator) == (8, 1)
    # RecipeIngredientUpdate is all-optional; the three FKs we did not send
    # must survive exclude_unset untouched.
    assert updated.ingredient == ingredient
    assert updated.measurement == measurement
    assert updated.preparation == preparation


def test_update_recipe_ingredient_can_swap_the_ingredient(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)
    other = IngredientRead.model_validate(client.post("/ingredients/", json={"name": "olive oil"}).json())

    patch_response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}", json={"ingredient_id": other.id})
    assert patch_response.status_code == 200

    updated = RecipeIngredientRead.model_validate(patch_response.json())
    assert updated.ingredient == other
    assert updated.measurement == measurement


def test_update_recipe_ingredient_not_found(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/999", json={"amount_numerator": 8})

    assert response.status_code == 404


def test_update_recipe_ingredient_under_the_wrong_recipe(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    response = client.patch(f"/recipes/{other.id}/{PREFIX}/{ri_id}", json={"amount_numerator": 99})

    assert response.status_code == 404


def test_delete_recipe_ingredient(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    delete_response = client.delete(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}")
    assert delete_response.status_code == 204

    assert _ingredients(client, recipe.id) == []


def test_delete_recipe_ingredient_not_found(client: TestClient, recipe: RecipeRead):
    response = client.delete(f"/recipes/{recipe.id}/{PREFIX}/999")

    assert response.status_code == 404


def test_delete_recipe_ingredient_under_the_wrong_recipe(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    created = _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    delete_response = client.delete(f"/recipes/{other.id}/{PREFIX}/{ri_id}")
    assert delete_response.status_code == 404

    assert _ingredients(client, recipe.id) == [created]


def test_recipe_ingredients_appear_on_the_parent_recipe(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    created = _create(client, recipe.id, _payload(ingredient, measurement, preparation))

    response = client.get(f"/recipes/{recipe.id}")

    assert response.status_code == 200
    parent = RecipeRead.model_validate(response.json())
    assert parent.recipe_ingredients == [created]


@pytest.mark.parametrize("field", ["ingredient_id", "measurement_id", "amount_numerator", "amount_denominator"])
def test_update_recipe_ingredient_rejects_null(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
    field: str,
):
    _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}", json={field: None})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][-1] == field


@pytest.mark.parametrize(("sent", "stored"), [((7, 2), (7, 2)), ((4, 8), (1, 2)), ((6, 3), (2, 1)), ((5, 1), (5, 1))])
def test_amounts_are_stored_reduced(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
    sent: tuple[int, int],
    stored: tuple[int, int],
):
    payload = {**_payload(ingredient, measurement, preparation, amount=sent[0]), "amount_denominator": sent[1]}

    created = _create(client, recipe.id, payload)

    assert (created.amount_numerator, created.amount_denominator) == stored


def test_nested_recipe_create_reduces_amounts(
    client: TestClient, ingredient: IngredientRead, measurement: MeasurementRead, preparation: PreparationRead
):
    ri = {**_payload(ingredient, measurement, preparation, amount=2), "amount_denominator": 8}

    response = client.post("/recipes/", json={"name": "R", "recipe_ingredients": [ri]})

    created = RecipeRead.model_validate(response.json()).recipe_ingredients[0]
    assert (created.amount_numerator, created.amount_denominator) == (1, 4)


def test_updating_one_half_of_an_amount_reduces_the_whole(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    created = _create(client, recipe.id, _payload(ingredient, measurement, preparation, amount=6))

    response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{created.id}", json={"amount_denominator": 4})

    updated = RecipeIngredientRead.model_validate(response.json())
    assert (updated.amount_numerator, updated.amount_denominator) == (3, 2)


@pytest.mark.parametrize("denominator", [0, 5, 6, 16, -2])
def test_unsupported_denominator_is_rejected(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
    denominator: int,
):
    payload = {**_payload(ingredient, measurement, preparation), "amount_denominator": denominator}

    response = client.post(f"/recipes/{recipe.id}/{PREFIX}/", json=payload)

    assert response.status_code == 422


def test_preparation_is_optional_and_can_be_cleared(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    bare = {"ingredient_id": ingredient.id, "measurement_id": measurement.id, "amount_numerator": 2}
    assert _create(client, recipe.id, bare).preparation is None

    prepared = _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{prepared.id}", json={"preparation_id": None})

    assert response.status_code == 200
    assert RecipeIngredientRead.model_validate(response.json()).preparation is None
