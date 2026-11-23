from datetime import date

from pydantic import BaseModel

from app.schemas.fields import Day, DbId, PositiveInt


class PlannedMealCreate(BaseModel):
    day: Day
    recipe_id: DbId
    servings: PositiveInt | None = None  # None: as written


class PlannedMealWrite(BaseModel):
    servings: PositiveInt | None = None


class PlannedMealRead(BaseModel):
    id: int
    day: date
    recipe_id: int
    name: str
    servings: int | None
    recipe_servings: int | None  # what the recipe is written for


class DayRange(BaseModel):
    start: Day
    end: Day  # included
