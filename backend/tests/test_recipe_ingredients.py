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
        "amount": amount,
    }


def _create(client: TestClient, recipe_id: int, payload: dict) -> RecipeIngredientRead:
    response = client.post(f"/recipes/{recipe_id}/{PREFIX}/", json=payload)
    assert response.status_code == 201
    return RecipeIngredientRead.model_validate(response.json())


def _only_id(db_session: Session, recipe_id: int) -> int:
    """Read the row id straight from the database.

    RecipeIngredientRead exposes no `id`, but the routes are addressed by one,
    so there is no way to learn it through the API. Until the schema grows an
    `id` field, the tests have to reach past the API to address a row.
    """
    return db_session.execute(
        select(RecipeIngredient.id).where(RecipeIngredient.recipe_id == recipe_id)
    ).scalars().one()


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
    assert created.amount == 3


def test_create_recipe_ingredient_requires_all_ids(client: TestClient, recipe: RecipeRead):
    response = client.post(f"/recipes/{recipe.id}/{PREFIX}/", json={"amount": 3})

    assert response.status_code == 422


def test_create_recipe_ingredient_for_unknown_recipe(
    client: TestClient,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    response = client.post(
        f"/recipes/999/{PREFIX}/", json=_payload(ingredient, measurement, preparation)
    )

    assert response.status_code == 404


def test_list_recipe_ingredients_empty(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/{PREFIX}/")

    assert response.status_code == 200
    assert response.json() == []


def test_list_recipe_ingredients_is_scoped_to_its_recipe(
    client: TestClient,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    other = RecipeRead.model_validate(client.post("/recipes/", json={"name": "Coq au Vin"}).json())
    mine = _create(client, recipe.id, _payload(ingredient, measurement, preparation, amount=3))
    _create(client, other.id, _payload(ingredient, measurement, preparation, amount=7))

    response = client.get(f"/recipes/{recipe.id}/{PREFIX}/")

    assert response.status_code == 200
    assert [RecipeIngredientRead.model_validate(row) for row in response.json()] == [mine]


def test_get_recipe_ingredient(
    client: TestClient,
    db_session: Session,
    recipe: RecipeRead,
    ingredient: IngredientRead,
    measurement: MeasurementRead,
    preparation: PreparationRead,
):
    created = _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    response = client.get(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}")

    assert response.status_code == 200
    assert RecipeIngredientRead.model_validate(response.json()) == created


def test_get_recipe_ingredient_not_found(client: TestClient, recipe: RecipeRead):
    response = client.get(f"/recipes/{recipe.id}/{PREFIX}/999")

    assert response.status_code == 404


def test_get_recipe_ingredient_under_the_wrong_recipe(
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

    response = client.get(f"/recipes/{other.id}/{PREFIX}/{ri_id}")

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

    patch_response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}", json={"amount": 8})
    assert patch_response.status_code == 200

    response = client.get(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}")
    updated = RecipeIngredientRead.model_validate(response.json())
    assert updated.amount == 8
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
    other = IngredientRead.model_validate(
        client.post("/ingredients/", json={"name": "olive oil"}).json()
    )

    patch_response = client.patch(
        f"/recipes/{recipe.id}/{PREFIX}/{ri_id}", json={"ingredient_id": other.id}
    )
    assert patch_response.status_code == 200

    updated = RecipeIngredientRead.model_validate(patch_response.json())
    assert updated.ingredient == other
    assert updated.measurement == measurement


def test_update_recipe_ingredient_not_found(client: TestClient, recipe: RecipeRead):
    response = client.patch(f"/recipes/{recipe.id}/{PREFIX}/999", json={"amount": 8})

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

    response = client.patch(f"/recipes/{other.id}/{PREFIX}/{ri_id}", json={"amount": 99})

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

    assert client.get(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}").status_code == 404
    assert client.get(f"/recipes/{recipe.id}/{PREFIX}/").json() == []


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
    _create(client, recipe.id, _payload(ingredient, measurement, preparation))
    ri_id = _only_id(db_session, recipe.id)

    delete_response = client.delete(f"/recipes/{other.id}/{PREFIX}/{ri_id}")
    assert delete_response.status_code == 404

    assert client.get(f"/recipes/{recipe.id}/{PREFIX}/{ri_id}").status_code == 200


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
