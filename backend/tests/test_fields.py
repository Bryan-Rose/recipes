import pytest
from pydantic import ValidationError

from app.schemas.user import UserUpdate


def test_omittable_field_left_out_stays_unset():
    # Relies on pydantic not validating defaults; validate_default=True would 422 every partial PATCH.
    assert UserUpdate().model_dump(exclude_unset=True) == {}
    assert UserUpdate(full_name="x").model_dump(exclude_unset=True) == {"full_name": "x"}


def test_omittable_field_rejects_null():
    with pytest.raises(ValidationError):
        UserUpdate.model_validate({"full_name": None})
