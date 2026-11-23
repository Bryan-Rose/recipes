from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.meal_plan import PlannedMeal
from app.models.recipe import Recipe
from app.schemas.fields import IdPath
from app.schemas.meal_plan import DayRange, PlannedMealCreate, PlannedMealRead, PlannedMealWrite
from app.schemas.shopping import ShoppingListRead
from app.services import meal_plan as meal_plan_service
from app.services import shopping as shopping_service

# One plan, shared by every user, like the shopping list it feeds.
router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])


@router.get("/meals", response_model=list[PlannedMealRead])
def list_meals(start: date, end: date, db: Session = Depends(get_db)):
    """The meals planned from start to end, both included."""
    return [meal_plan_service.read(meal) for meal in meal_plan_service.get_meals(db, start, end)]


@router.post("/meals", response_model=PlannedMealRead, status_code=status.HTTP_201_CREATED)
def add_meal(body: PlannedMealCreate, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, body.recipe_id)
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such recipe")
    return meal_plan_service.read(meal_plan_service.add_meal(db, recipe, body.day, body.servings))


@router.put("/meals/{meal_id}", response_model=PlannedMealRead)
def put_meal(meal_id: IdPath, body: PlannedMealWrite, db: Session = Depends(get_db)):
    """Changes the servings a meal is planned for."""
    meal = db.get(PlannedMeal, meal_id)
    if meal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    meal.servings = body.servings
    db.commit()
    return meal_plan_service.read(meal)


@router.delete("/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_meal(meal_id: IdPath, db: Session = Depends(get_db)):
    meal = db.get(PlannedMeal, meal_id)
    if meal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    db.delete(meal)
    db.commit()


@router.post("/shop", response_model=ShoppingListRead)
def shop(body: DayRange, db: Session = Depends(get_db)):
    """Adds the meals from start to end to the shopping list."""
    meal_plan_service.shop(db, body.start, body.end)
    return shopping_service.get_list(db)
