from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.schemas.ingredient import IngredientRead
from app.schemas.measurement import MeasurementRead


## Recipe Ingredient

class RecipeIngredientCreate(BaseModel):
    ingredient_id: int
    measurement_id: int
    amount: int


class RecipeIngredientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    ingredient: IngredientRead
    measurement: MeasurementRead
    amount: int


class RecipeIngredientUpdate(BaseModel):
    id: int
    ingredient_id: int | None = None
    measurement_id: int | None = None
    amount: int | None = None

## Recipe Ingredient

## Step

class StepUpdate(BaseModel):
    id: int
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
    id: int
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
    estimated_time: str


class RecipeCreate(RecipeBase):
    steps: list[StepCreate] = []
    requirements: list[RequirementCreate] = []


class RecipeUpdate(BaseModel):
    name: str | None = None
    cookbook_id: int | None = None
    cookbook_page: int | None = None
    estimated_time: str | None = None
    steps: list[StepUpdate]= []
    requirements: list[RequirementUpdate] = []
    recipe_ingredients: list[RecipeIngredientUpdate] = []


class RecipeRead(RecipeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_user_id: int
    created_at: datetime
    updated_at: datetime
    steps: list[StepRead] = []
    requirements: list[RequirementRead] = []
    recipe_ingredients: list[RecipeIngredientRead] = []

## Recipe
