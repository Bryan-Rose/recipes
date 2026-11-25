from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.author import AuthorRead
from app.schemas.cookbook import CookbookRead
from app.schemas.fields import DbId, Denominator, JpegBase64, Minutes, Name, Omittable, PositiveInt, SourceUrl, UtcDatetime
from app.schemas.imports import SourceImport
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.tag import TagRead

## Recipe Ingredient


class RecipeIngredientCreate(BaseModel):
    ingredient_id: DbId
    measurement_id: DbId
    preparation_id: DbId | None = None
    amount_numerator: PositiveInt
    amount_denominator: Denominator = 1
    group: Name | None = None
    note: Name | None = None


class RecipeIngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ingredient: IngredientRead
    measurement: MeasurementRead
    preparation: PreparationRead | None
    amount_numerator: int
    amount_denominator: Denominator
    group: str | None
    note: str | None


class RecipeIngredientUpdate(BaseModel):
    ingredient_id: Omittable[DbId] = None
    measurement_id: Omittable[DbId] = None
    amount_numerator: Omittable[PositiveInt] = None
    amount_denominator: Omittable[Denominator] = None
    preparation_id: DbId | None = None
    # null clears these, like preparation_id.
    group: Name | None = None
    note: Name | None = None


## Recipe Ingredient

## Step


class StepUpdate(BaseModel):
    text: Name


class StepCreate(BaseModel):
    text: Name


class StepOrder(BaseModel):
    # Every step of the recipe, each once, in the new order.
    step_ids: list[DbId]


class RequirementOrder(BaseModel):
    # Every requirement of the recipe, each once, in the new order.
    requirement_ids: list[DbId]


class RecipeIngredientOrder(BaseModel):
    # Every ingredient line of the recipe, each once, in the new order.
    recipe_ingredient_ids: list[DbId]


class StepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str


## Step


## Requirement


class RequirementCreate(BaseModel):
    name: Name


class RequirementUpdate(BaseModel):
    name: Name


class RequirementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


## Requirement

## Recipe


class ImageUpload(BaseModel):
    """One picture, resized by the browser: the full image and a thumbnail for lists."""

    full: JpegBase64
    thumb: JpegBase64


AUTHOR_WITH_COOKBOOK = "author_id is only for a recipe without a cookbook_id"


class RecipeBase(BaseModel):
    name: Name
    cookbook_id: DbId | None = None
    cookbook_page: PositiveInt | None = None
    author_id: DbId | None = None  # only without a cookbook: a cookbook recipe's author is its cookbook's
    active_cook_time: Minutes | None = None
    inactive_cook_time: Minutes | None = None
    servings: PositiveInt | None = None
    notes: str | None = None
    source_url: SourceUrl | None = None


class RecipeCreate(RecipeBase):
    steps: list[StepCreate] = []
    requirements: list[RequirementCreate] = []
    recipe_ingredients: list[RecipeIngredientCreate] = []
    tag_ids: list[DbId] = []
    image: ImageUpload | None = None
    import_id: DbId | None = None  # the RecipeImport.import_id this recipe was saved from

    @model_validator(mode="after")
    def _page_needs_cookbook(self) -> Self:
        if self.cookbook_page is not None and self.cookbook_id is None:
            raise ValueError("cookbook_page requires a cookbook_id")
        if self.author_id is not None and self.cookbook_id is not None:
            raise ValueError(AUTHOR_WITH_COOKBOOK)
        return self


class RecipeUpdate(BaseModel):
    name: Omittable[Name] = None
    cookbook_id: DbId | None = None
    cookbook_page: PositiveInt | None = None
    author_id: DbId | None = None
    active_cook_time: Minutes | None = None
    inactive_cook_time: Minutes | None = None
    servings: PositiveInt | None = None
    notes: str | None = None
    source_url: SourceUrl | None = None
    # Replaces the recipe's full tag set when present.
    tag_ids: Omittable[list[DbId]] = None


class RecipeRead(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_user_id: int
    created_at: UtcDatetime
    updated_at: UtcDatetime
    cookbook: CookbookRead | None = None
    author: AuthorRead | None = None
    steps: list[StepRead] = []
    requirements: list[RequirementRead] = []
    recipe_ingredients: list[RecipeIngredientRead] = []
    tags: list[TagRead] = []
    # The stem of the files GET /images/ serves: {image}.jpg and {image}-thumb.jpg.
    image: str | None = None
    source_import: SourceImport | None = None  # what importing it cost; None if it wasn't imported


class RecipeSummary(BaseModel):
    """A GET /recipes/ row: what the list and browse pages show and search, without steps or full ingredients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    cookbook_id: int | None
    cookbook_page: PositiveInt | None
    author_id: int | None
    active_cook_time: Minutes | None
    inactive_cook_time: Minutes | None
    created_at: UtcDatetime
    cookbook: CookbookRead | None
    tags: list[TagRead]
    ingredient_names: list[str]  # one per recipe ingredient, so its length is the ingredient count
    step_count: int
    image: str | None


## Recipe
