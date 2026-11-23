from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.meal_plan import PlannedMeal
from app.models.recipe import Recipe
from app.models.shopping import ShoppingListRecipe
from app.schemas.meal_plan import PlannedMealRead


def read(meal: PlannedMeal) -> PlannedMealRead:
    recipe = meal.recipe
    return PlannedMealRead(
        id=meal.id, day=meal.day, recipe_id=recipe.id, name=recipe.name, servings=meal.servings, recipe_servings=recipe.servings
    )


def get_meals(db: Session, start: date, end: date) -> list[PlannedMeal]:
    """The meals planned from start to end, both included, by day and then in the order added."""
    query = (
        select(PlannedMeal)
        .where(PlannedMeal.day >= start, PlannedMeal.day <= end)
        .options(selectinload(PlannedMeal.recipe))
        .order_by(PlannedMeal.day, PlannedMeal.id)
    )
    return list(db.execute(query).scalars())


def add_meal(db: Session, recipe: Recipe, day: date, servings: int | None) -> PlannedMeal:
    meal = PlannedMeal(recipe=recipe, day=day, servings=servings)
    db.add(meal)
    db.commit()
    return meal


def shop(db: Session, start: date, end: date) -> None:
    """Puts the meals from start to end on the shopping list, adding their servings to any already there."""
    listed = {entry.recipe_id: entry for entry in db.execute(select(ShoppingListRecipe)).scalars()}
    for meal in get_meals(db, start, end):
        recipe = meal.recipe
        entry = listed.get(recipe.id)
        if entry is None:
            listed[recipe.id] = entry = ShoppingListRecipe(recipe_id=recipe.id, servings=meal.servings)
            db.add(entry)
        elif recipe.servings:
            # None on the list means as written.
            entry.servings = (entry.servings or recipe.servings) + (meal.servings or recipe.servings)
        # shortcut: a recipe without servings can't be scaled, so planning it twice still lists it once (#182).
    db.commit()
