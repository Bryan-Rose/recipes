from fractions import Fraction

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.recipe import Recipe, RecipeIngredient
from app.models.shopping import ShoppingListCheck, ShoppingListRecipe
from app.schemas.shopping import ShoppingLine, ShoppingListRead, ShoppingRecipeRead

_Totals = dict[tuple[int, int], tuple[RecipeIngredient, Fraction]]


def _totals(db: Session) -> tuple[list[ShoppingRecipeRead], _Totals]:
    """The listed recipes, and the amount each (ingredient, measurement) line needs across them."""
    entries = db.execute(
        select(ShoppingListRecipe).options(
            selectinload(ShoppingListRecipe.recipe).selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient),
            selectinload(ShoppingListRecipe.recipe).selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.measurement),
        )
    ).scalars()
    recipes: list[ShoppingRecipeRead] = []
    totals: _Totals = {}
    for entry in entries:
        recipe = entry.recipe
        recipes.append(ShoppingRecipeRead(recipe_id=recipe.id, name=recipe.name, servings=entry.servings, recipe_servings=recipe.servings))
        # Fraction keeps the sum exact (⅓ + ⅓ + ⅓ is 1); the browser rounds once, for display.
        scale = Fraction(entry.servings, recipe.servings) if entry.servings and recipe.servings else Fraction(1)
        for ri in recipe.recipe_ingredients:
            key = (ri.ingredient_id, ri.measurement_id)
            amount = Fraction(ri.amount_numerator, ri.amount_denominator) * scale
            totals[key] = (ri, totals[key][1] + amount if key in totals else amount)
    return recipes, totals


def get_list(db: Session) -> ShoppingListRead:
    recipes, totals = _totals(db)
    ticked = {
        (c.ingredient_id, c.measurement_id): Fraction(c.amount_numerator, c.amount_denominator)
        for c in db.execute(select(ShoppingListCheck)).scalars()
    }
    lines = [
        ShoppingLine.model_validate(
            {
                "ingredient": ri.ingredient,
                "measurement": ri.measurement,
                "amount_numerator": amount.numerator,
                "amount_denominator": amount.denominator,
                "checked": key in ticked and ticked[key] >= amount,
            },
            from_attributes=True,
        )
        for key, (ri, amount) in totals.items()
    ]
    recipes.sort(key=lambda r: r.name.casefold())
    lines.sort(key=lambda line: (line.ingredient.name.casefold(), line.measurement.name.casefold()))
    return ShoppingListRead(recipes=recipes, lines=lines)


def put_recipe(db: Session, recipe: Recipe, servings: int | None) -> None:
    entry = db.get(ShoppingListRecipe, recipe.id) or ShoppingListRecipe(recipe_id=recipe.id)
    entry.servings = servings
    db.add(entry)
    db.commit()


def remove_recipe(db: Session, recipe_id: int) -> bool:
    entry = db.get(ShoppingListRecipe, recipe_id)
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True


class NotOnListError(Exception):
    pass


def set_checked(db: Session, ingredient_id: int, measurement_id: int, checked: bool) -> None:
    check = db.get(ShoppingListCheck, (ingredient_id, measurement_id))
    if not checked:
        if check is not None:
            db.delete(check)
            db.commit()
        return
    line = _totals(db)[1].get((ingredient_id, measurement_id))
    if line is None:
        raise NotOnListError
    check = check or ShoppingListCheck(ingredient_id=ingredient_id, measurement_id=measurement_id)
    check.amount_numerator, check.amount_denominator = line[1].numerator, line[1].denominator
    db.add(check)
    db.commit()


def clear(db: Session) -> None:
    db.execute(delete(ShoppingListRecipe))
    db.execute(delete(ShoppingListCheck))
    db.commit()
