from fractions import Fraction

from sqlalchemy import delete, select, tuple_
from sqlalchemy.orm import Session, selectinload

from app.models.recipe import Recipe, RecipeIngredient
from app.models.shopping import ShoppingListCheck, ShoppingListRecipe
from app.schemas.shopping import ShoppingLine, ShoppingListRead, ShoppingRecipeRead


def get_list(db: Session) -> ShoppingListRead:
    entries = db.execute(
        select(ShoppingListRecipe).options(
            selectinload(ShoppingListRecipe.recipe).selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient),
            selectinload(ShoppingListRecipe.recipe).selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.measurement),
        )
    ).scalars()
    checked = set(db.execute(select(ShoppingListCheck.ingredient_id, ShoppingListCheck.measurement_id)).tuples())

    recipes: list[ShoppingRecipeRead] = []
    totals: dict[tuple[int, int], tuple[RecipeIngredient, Fraction]] = {}
    for entry in entries:
        recipe = entry.recipe
        recipes.append(ShoppingRecipeRead(recipe_id=recipe.id, name=recipe.name, servings=entry.servings, recipe_servings=recipe.servings))
        # Fraction keeps the sum exact (⅓ + ⅓ + ⅓ is 1); the browser rounds once, for display.
        scale = Fraction(entry.servings, recipe.servings) if entry.servings and recipe.servings else Fraction(1)
        for ri in recipe.recipe_ingredients:
            key = (ri.ingredient_id, ri.measurement_id)
            amount = Fraction(ri.amount_numerator, ri.amount_denominator) * scale
            totals[key] = (ri, totals[key][1] + amount if key in totals else amount)

    lines = [
        ShoppingLine.model_validate(
            {
                "ingredient": ri.ingredient,
                "measurement": ri.measurement,
                "amount_numerator": amount.numerator,
                "amount_denominator": amount.denominator,
                "checked": key in checked,
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
    # Its lines now need more than was ticked off, so they're to buy again.
    pairs = [(ri.ingredient_id, ri.measurement_id) for ri in recipe.recipe_ingredients]
    if pairs:
        db.execute(delete(ShoppingListCheck).where(tuple_(ShoppingListCheck.ingredient_id, ShoppingListCheck.measurement_id).in_(pairs)))
    db.commit()


def remove_recipe(db: Session, recipe_id: int) -> bool:
    entry = db.get(ShoppingListRecipe, recipe_id)
    if entry is None:
        return False
    db.delete(entry)
    db.commit()
    return True


def set_checked(db: Session, ingredient_id: int, measurement_id: int, checked: bool) -> None:
    check = db.get(ShoppingListCheck, (ingredient_id, measurement_id))
    if checked and check is None:
        db.add(ShoppingListCheck(ingredient_id=ingredient_id, measurement_id=measurement_id))
    elif not checked and check is not None:
        db.delete(check)
    db.commit()


def clear(db: Session) -> None:
    db.execute(delete(ShoppingListRecipe))
    db.execute(delete(ShoppingListCheck))
    db.commit()
