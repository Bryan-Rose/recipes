from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.fields import Denominator, Name

# Plain types below: this is also the structured-output schema Claude fills in,
# and the review screen, not this schema, is where a bad value gets fixed.


class ImportedIngredient(BaseModel):
    amount_numerator: int
    amount_denominator: Denominator
    measurement: str
    ingredient: str
    preparation: str | None


class RecipeDraft(BaseModel):
    """A parsed recipe for the user to review. Lookups are by name; nothing is saved."""

    name: str
    servings: int | None
    active_cook_time: int | None
    inactive_cook_time: int | None
    notes: str | None
    ingredients: list[ImportedIngredient]
    requirements: list[str]
    steps: list[str]


class ImportUsage(BaseModel):
    """What one parse cost. cost_usd is None for a model missing from the price table."""

    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None


class RecipeImport(RecipeDraft):
    usage: ImportUsage


class TextImport(BaseModel):
    text: Annotated[Name, Field(max_length=20_000)]
