import base64
import binascii
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

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


def _jpeg(value: str) -> str:
    try:
        is_jpeg = base64.b64decode(value, validate=True).startswith(b"\xff\xd8\xff")
    except binascii.Error:
        is_jpeg = False
    if not is_jpeg:
        raise ValueError("must be a base64 JPEG")
    return value


# The Claude API takes images up to 5 MB; the browser sends ~1600px JPEGs, well under that.
JpegBase64 = Annotated[str, Field(max_length=5_000_000), AfterValidator(_jpeg)]


class PhotoImport(BaseModel):
    """Pages of one recipe, in order."""

    photos: Annotated[list[JpegBase64], Field(min_length=1, max_length=4)]
