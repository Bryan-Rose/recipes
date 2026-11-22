from pydantic import BaseModel

from app.schemas.fields import PositiveInt
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead


class ShoppingRecipeWrite(BaseModel):
    # None shops for the recipe as written.
    servings: PositiveInt | None = None


class ShoppingRecipeRead(BaseModel):
    recipe_id: int
    name: str
    servings: int | None
    recipe_servings: int | None  # what the amounts are written for


class ShoppingLine(BaseModel):
    """One ingredient in one measurement, summed over the list's recipes. The amount is exact, so any denominator."""

    ingredient: IngredientRead
    measurement: MeasurementRead
    amount_numerator: int
    amount_denominator: int
    checked: bool


class ShoppingListRead(BaseModel):
    recipes: list[ShoppingRecipeRead]
    lines: list[ShoppingLine]
