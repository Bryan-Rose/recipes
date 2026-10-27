"""Migrate the database to the latest schema and seed it with sample data for local development.

Run from the backend/ directory:

    uv run python -m scripts.init_db            # migrate, seed if empty
    uv run python -m scripts.init_db --reset    # drop everything first
    uv run python -m scripts.init_db --no-seed  # migrate only (the container runs this on start)

This is deliberately a standalone script rather than a FastAPI startup hook.
The test suite drives the app through `with TestClient(...)`, which fires
lifespan handlers, so migrating from app.main would create a stray app.db in
backend/ on every test run.
"""

import argparse
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, MetaData, inspect, select
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.database import SessionLocal, engine
from app.models.author import Author
from app.models.cookbook import Cookbook
from app.models.ingredient import Ingredient
from app.models.measurement import Measurement
from app.models.preparation import Preparation
from app.models.recipe import Recipe, RecipeIngredient, Requirement, Step
from app.models.user import User


def seed(db: Session) -> None:
    # Sample recipes need an author. No password, so nobody can sign in as it;
    # create real accounts with scripts/create_user.py.
    user = User(username="sample", full_name="Sample Data")
    db.add(user)

    # "whole" is the neutral default: RecipeIngredient.preparation_id is
    # non-nullable, so every ingredient row needs some preparation selected.
    preparations = {name: Preparation(name=name) for name in ("whole", "chopped", "diced", "minced", "sliced", "melted", "beaten")}
    measurements = {name: Measurement(name=name) for name in ("cup", "tablespoon", "teaspoon", "ounce", "pound", "gram", "clove", "whole")}
    ingredients = {
        name: Ingredient(name=name)
        for name in (
            "butter",
            "flour",
            "sugar",
            "egg",
            "milk",
            "salt",
            "garlic",
            "onion",
            "olive oil",
            "black pepper",
            "parmesan",
            "spaghetti",
        )
    }
    db.add_all([*preparations.values(), *measurements.values(), *ingredients.values()])

    child = Author(name="Julia Child")
    hazan = Author(name="Marcella Hazan")
    db.add_all([child, hazan])

    mastering = Cookbook(name="Mastering the Art of French Cooking", author=child)
    essentials = Cookbook(name="Essentials of Classic Italian Cooking", author=hazan)
    db.add_all([mastering, essentials])

    def ingredient_row(ingredient: str, measurement: str, amount: int, preparation: str = "whole") -> RecipeIngredient:
        return RecipeIngredient(
            ingredient=ingredients[ingredient],
            measurement=measurements[measurement],
            preparation=preparations[preparation],
            amount=amount,
        )

    carbonara = Recipe(
        name="Spaghetti Carbonara",
        cookbook=essentials,
        cookbook_page=212,
        active_cook_time="20 minutes",
        inactive_cook_time="0 minutes",
        servings="4",
        created_user=user,
        recipe_ingredients=[
            ingredient_row("spaghetti", "pound", 1),
            ingredient_row("egg", "whole", 4, "beaten"),
            ingredient_row("parmesan", "cup", 1),
            ingredient_row("black pepper", "teaspoon", 2),
            ingredient_row("salt", "teaspoon", 1),
        ],
        requirements=[
            Requirement(name="Large pot"),
            Requirement(name="Mixing bowl"),
            Requirement(name="Tongs"),
        ],
        steps=[
            Step(text="Bring a large pot of well-salted water to a boil."),
            Step(text="Beat the eggs with the grated parmesan and plenty of black pepper."),
            Step(text="Cook the spaghetti until al dente, reserving a cup of the pasta water."),
            Step(text="Off the heat, toss the hot pasta with the egg mixture, loosening with pasta water until glossy."),
            Step(text="Serve immediately with more parmesan and pepper."),
        ],
    )

    pancakes = Recipe(
        name="Buttermilk Pancakes",
        active_cook_time="15 minutes",
        inactive_cook_time="10 minutes",
        servings="Makes about 12",
        created_user=user,
        recipe_ingredients=[
            ingredient_row("flour", "cup", 2),
            ingredient_row("sugar", "tablespoon", 2),
            ingredient_row("egg", "whole", 2, "beaten"),
            ingredient_row("milk", "cup", 2),
            ingredient_row("butter", "tablespoon", 3, "melted"),
            ingredient_row("salt", "teaspoon", 1),
        ],
        requirements=[
            Requirement(name="Griddle or heavy skillet"),
            Requirement(name="Whisk"),
        ],
        steps=[
            Step(text="Whisk the dry ingredients together in a large bowl."),
            Step(text="Whisk the eggs, milk, and melted butter together separately."),
            Step(text="Fold the wet into the dry until just combined — lumps are fine."),
            Step(text="Rest the batter for 10 minutes while the griddle heats."),
            Step(text="Cook until bubbles break across the surface, then flip and cook one minute more."),
        ],
    )

    garlic_bread = Recipe(
        name="Garlic Bread",
        cookbook=mastering,
        cookbook_page=87,
        active_cook_time="10 minutes",
        inactive_cook_time="12 minutes",
        servings="6",
        created_user=user,
        recipe_ingredients=[
            ingredient_row("butter", "cup", 1, "melted"),
            ingredient_row("garlic", "clove", 6, "minced"),
            ingredient_row("olive oil", "tablespoon", 2),
            ingredient_row("salt", "teaspoon", 1),
        ],
        requirements=[Requirement(name="Baking sheet")],
        steps=[
            Step(text="Heat the oven to 400°F."),
            Step(text="Stir the minced garlic into the melted butter and olive oil with the salt."),
            Step(text="Split the loaf lengthwise and brush both cut faces generously."),
            Step(text="Bake 12 minutes, until the edges are crisp and golden."),
        ],
    )

    db.add_all([carbonara, pancakes, garlic_bread])
    db.commit()


def backup(engine: Engine, config: Config) -> str | None:
    """Copy a SQLite database aside before migrating it, named for the revision it was at.

    Skipped when there's nothing to migrate or nothing to lose (a new database).
    """
    if engine.dialect.name != "sqlite":
        return None
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    if current in (None, ScriptDirectory.from_config(config).get_current_head()):
        return None
    path = f"{engine.url.database}.pre-{current}.bak"
    source, target = sqlite3.connect(str(engine.url.database)), sqlite3.connect(path)
    source.backup(target)
    target.close()
    source.close()
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="drop all tables before migrating")
    parser.add_argument("--no-seed", action="store_true", help="migrate only (used by the container on start)")
    args = parser.parse_args()

    if args.reset:
        # Reflect rather than use Base.metadata, so alembic_version and any
        # tables that are no longer modelled are dropped too.
        existing = MetaData()
        existing.reflect(engine)
        existing.drop_all(engine)
        print("dropped all tables")

    tables = set(inspect(engine).get_table_names())
    if tables and "alembic_version" not in tables:
        raise SystemExit(
            "This database was created before migrations existed and can't be upgraded in place.\n"
            "Recreate it with --reset (this deletes its data)."
        )

    config = Config(Path(__file__).resolve().parent.parent / "alembic.ini")
    if path := backup(engine, config):
        print(f"backed up database to {path}")
    command.upgrade(config, "head")
    print("migrated to latest schema")
    if args.no_seed:
        return

    with SessionLocal() as db:
        if db.execute(select(Recipe).limit(1)).scalar_one_or_none() is not None:
            print("recipes already present — skipping seed (use --reset to start over)")
            return
        seed(db)
        print("seeded sample data — now create your account: uv run python -m scripts.create_user <username> --admin")


if __name__ == "__main__":
    main()
