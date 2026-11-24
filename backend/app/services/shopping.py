from fractions import Fraction

from sqlalchemy import delete, event, select, text
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
        recipes.append(
            ShoppingRecipeRead(
                recipe_id=recipe.id, name=recipe.name, servings=entry.servings, recipe_servings=recipe.servings, batches=entry.batches
            )
        )
        # Fraction keeps the sum exact (⅓ + ⅓ + ⅓ is 1); the browser rounds once, for display.
        if recipe.servings:
            scale = Fraction(entry.servings or recipe.servings, recipe.servings)
        else:
            scale = Fraction(entry.batches)
        for ri in recipe.recipe_ingredients:
            key = (ri.ingredient_id, ri.measurement_id)
            amount = Fraction(ri.amount_numerator, ri.amount_denominator) * scale
            totals[key] = (ri, totals[key][1] + amount if key in totals else amount)
    return recipes, totals


def get_list(db: Session) -> ShoppingListRead:
    recipes, totals = _totals(db)
    ticked = {(c.ingredient_id, c.measurement_id): Fraction(c.amount) for c in db.execute(select(ShoppingListCheck)).scalars()}
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


def put_recipe(db: Session, recipe: Recipe, servings: int | None, batches: int) -> None:
    entry = db.get(ShoppingListRecipe, recipe.id) or ShoppingListRecipe(recipe_id=recipe.id)
    entry.servings = servings
    entry.batches = batches
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
    check.amount = str(line[1])
    db.add(check)
    db.commit()


def clear(db: Session) -> None:
    db.execute(delete(ShoppingListRecipe))
    db.execute(delete(ShoppingListCheck))
    db.commit()


# A line can leave the list through many paths: removing a recipe from it, deleting the recipe, or
# deleting or changing one of its ingredients. Rather than each of them remembering to, every commit
# drops the ticks whose line is gone, so a line that comes back later starts unticked.
_PRUNE_TICKS = text(
    "DELETE FROM shopping_list_checks WHERE NOT EXISTS ("
    " SELECT 1 FROM shopping_list_recipes AS listed"
    " JOIN recipe_ingredients AS ri ON ri.recipe_id = listed.recipe_id"
    " WHERE ri.ingredient_id = shopping_list_checks.ingredient_id"
    " AND ri.measurement_id = shopping_list_checks.measurement_id)"
)


@event.listens_for(Session, "before_commit")
def _prune_ticks(session: Session) -> None:
    session.flush()  # the app's sessions don't autoflush, and the prune must see this commit's changes
    session.execute(_PRUNE_TICKS)
