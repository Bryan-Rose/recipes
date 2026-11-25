from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.schemas.fields import Denominator, JpegBase64, Name, UtcDatetime

# Plain types below: this is also the structured-output schema Claude fills in,
# and the review screen, not this schema, is where a bad value gets fixed.


class ImportedIngredient(BaseModel):
    amount_numerator: int
    amount_denominator: Denominator
    measurement: str
    ingredient: str
    preparation: str | None
    group: str | None
    note: str | None


class RecipeDraft(BaseModel):
    """A parsed recipe for the user to review. Lookups are by name; nothing is saved."""

    name: str
    servings: int | None
    active_cook_time: int | None
    inactive_cook_time: int | None
    notes: str | None
    author: str | None
    tags: list[str]
    ingredients: list[ImportedIngredient]
    requirements: list[str]
    steps: list[str]


class ImportUsage(BaseModel):
    """What one parse cost. cost_usd is None for a model missing from the price table."""

    model_config = ConfigDict(from_attributes=True)

    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None


ImportSource = Literal["text", "photos", "url"]
ImportOutcome = Literal["draft", "no_draft", "cut_off"]


class RecipeImport(RecipeDraft):
    usage: ImportUsage
    import_id: int = Field(description="Send as RecipeCreate.import_id to tie this import's cost to the recipe saved from it.")
    image: str | None = Field(
        default=None,
        description="URL import only: the page's picture, base64, in whatever image format the site sent. None when it has none, "
        "or it couldn't be fetched.",
    )


class TextImport(BaseModel):
    text: Annotated[Name, Field(max_length=20_000)]


class PhotoImport(BaseModel):
    """Pages of one recipe, in order."""

    photos: Annotated[list[JpegBase64], Field(min_length=1, max_length=4)]


class UrlImport(BaseModel):
    url: Annotated[HttpUrl, Field(max_length=2_000)]


class ImportedRecipeRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ImportRead(ImportUsage):
    """A stored import, newest first in GET /imports/."""

    id: int
    created_at: UtcDatetime
    source: ImportSource
    outcome: ImportOutcome
    recipe: ImportedRecipeRef | None  # None: not saved, or the recipe was deleted (then saved is true)
    saved: bool
    original_parts: int = Field(
        description="Files GET /imports/{id}/original/{part} serves; 0 for imports from before originals were kept."
    )
    page_url: str | None = Field(description="URL import: the address the page was fetched from, after redirects.")


class ImportDetail(ImportRead):
    text: str | None = Field(description="Text import: what was pasted; None if its file is missing. Photos and pages are served as files.")


class SourceImport(ImportUsage):
    """What importing a recipe cost, and where to see what it was imported from."""

    id: int
    original_parts: int
