from pydantic import BaseModel, ConfigDict

from app.schemas.cookbook import CookbookRead
from app.schemas.fields import DbId, Denominator, Omittable, PositiveInt, SourceUrl, UtcDatetime
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


class RecipeIngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ingredient: IngredientRead
    measurement: MeasurementRead
    preparation: PreparationRead | None
    amount_numerator: int
    amount_denominator: Denominator


class RecipeIngredientUpdate(BaseModel):
    ingredient_id: Omittable[DbId] = None
    measurement_id: Omittable[DbId] = None
    amount_numerator: Omittable[PositiveInt] = None
    amount_denominator: Omittable[Denominator] = None
    preparation_id: DbId | None = None


## Recipe Ingredient

## Step


class StepUpdate(BaseModel):
    text: str


class StepCreate(BaseModel):
    text: str


class StepOrder(BaseModel):
    # Every step of the recipe, each once, in the new order.
    step_ids: list[DbId]


class StepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str


## Step


## Requirement


class RequirementCreate(BaseModel):
    name: str


class RequirementUpdate(BaseModel):
    name: str


class RequirementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


## Requirement

## Recipe


class RecipeBase(BaseModel):
    name: str
    cookbook_id: DbId | None = None
    cookbook_page: PositiveInt | None = None
    active_cook_time: str | None = None
    inactive_cook_time: str | None = None
    servings: PositiveInt | None = None
    notes: str | None = None
    source_url: SourceUrl | None = None


class RecipeCreate(RecipeBase):
    steps: list[StepCreate] = []
    requirements: list[RequirementCreate] = []
    recipe_ingredients: list[RecipeIngredientCreate] = []
    tag_ids: list[DbId] = []


class RecipeUpdate(BaseModel):
    name: Omittable[str] = None
    cookbook_id: DbId | None = None
    cookbook_page: PositiveInt | None = None
    active_cook_time: str | None = None
    inactive_cook_time: str | None = None
    servings: PositiveInt | None = None
    notes: str | None = None
    source_url: SourceUrl | None = None
    # Replaces the recipe's full tag set when present.
    tag_ids: Omittable[list[DbId]] = None


class RecipeRead(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_user_id: int
    created_at: UtcDatetime
    updated_at: UtcDatetime
    cookbook: CookbookRead | None = None
    steps: list[StepRead] = []
    requirements: list[RequirementRead] = []
    recipe_ingredients: list[RecipeIngredientRead] = []
    tags: list[TagRead] = []


## Recipe
