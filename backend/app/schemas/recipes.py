from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead
from app.schemas.preparation import PreparationRead
from app.schemas.cookbook import CookbookRead


## Recipe Ingredient


class RecipeIngredientCreate(BaseModel):
    ingredient_id: int
    measurement_id: int
    preparation_id: int
    amount: int


class RecipeIngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ingredient: IngredientRead
    measurement: MeasurementRead
    preparation: PreparationRead
    amount: int


class RecipeIngredientUpdate(BaseModel):
    id: int
    ingredient_id: int | None = None
    measurement_id: int | None = None
    amount: int | None = None
    preparation_id: int | None = None


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
    cookbook_id: int | None = None
    cookbook_page: int | None = None
    active_cook_time: str | None = None
    inactive_cook_time: str | None = None
    servings: str | None = None


class RecipeCreate(RecipeBase):
    steps: list[StepCreate] = []
    requirements: list[RequirementCreate] = []
    recipe_ingredients: list[RecipeIngredientCreate] = []


class RecipeUpdate(BaseModel):
    name: str | None = None
    cookbook_id: int | None = None
    cookbook_page: int | None = None
    active_cook_time: str | None = None
    inactive_cook_time: str | None = None
    servings: str | None = None

class RecipeRead(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_user_id: int
    created_at: datetime
    updated_at: datetime
    cookbook: CookbookRead | None = None
    steps: list[StepRead] = []
    requirements: list[RequirementRead] = []
    recipe_ingredients: list[RecipeIngredientRead] = []


## Recipe
