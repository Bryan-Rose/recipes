from pydantic import BaseModel, ConfigDict

from app.schemas.cookbook import CookbookRead
from app.schemas.fields import DbId, Omittable, PositiveInt, UtcDatetime
from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.tag import TagRead

## Recipe Ingredient


class RecipeIngredientCreate(BaseModel):
    ingredient_id: DbId
    measurement_id: DbId
    preparation_id: DbId
    amount: PositiveInt


class RecipeIngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ingredient: IngredientRead
    measurement: MeasurementRead
    preparation: PreparationRead
    amount: int


class RecipeIngredientUpdate(BaseModel):
    ingredient_id: Omittable[DbId] = None
    measurement_id: Omittable[DbId] = None
    amount: Omittable[PositiveInt] = None
    preparation_id: Omittable[DbId] = None


## Recipe Ingredient

## Step


class StepUpdate(BaseModel):
    text: str


class StepCreate(BaseModel):
    text: str


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
    servings: str | None = None


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
    servings: str | None = None
    # Replaces the recipe's full tag set when present.
    tag_ids: list[DbId] | None = None


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
