import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.user import UserUpdate


def test_omittable_field_left_out_stays_unset():
    # Relies on pydantic not validating defaults; validate_default=True would 422 every partial PATCH.
    assert UserUpdate().model_dump(exclude_unset=True) == {}
    assert UserUpdate(full_name="x").model_dump(exclude_unset=True) == {"full_name": "x"}


def test_omittable_field_rejects_null():
    with pytest.raises(ValidationError):
        UserUpdate.model_validate({"full_name": None})


@pytest.mark.parametrize(
    "body",
    [
        {"servings": True},  # PositiveInt
        {"active_cook_time": False},  # Minutes
        {"cookbook_id": True},  # DbId
        {
            "recipe_ingredients": [{"ingredient_id": 1, "measurement_id": 1, "amount_numerator": 1, "amount_denominator": True}]
        },  # Denominator
    ],
)
def test_integers_reject_booleans(client: TestClient, body: dict):
    # Lax pydantic reads JSON true as 1; found by the fuzzer (#174).
    response = client.post("/recipes/", json={"name": "Bool soup"} | body)
    assert response.status_code == 422
    assert "not true or false" in response.text


def test_integers_still_accept_integral_floats(client: TestClient):
    assert client.post("/recipes/", json={"name": "Float soup", "servings": 2.0}).json()["servings"] == 2
