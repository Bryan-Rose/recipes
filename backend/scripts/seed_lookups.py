"""Add starter measurements, preparations and ingredients that aren't there yet.

Run from the backend/ directory (or in the container via `docker compose exec backend ...`):

    uv run python -m scripts.seed_lookups

Only missing names are added, so it's safe to rerun. Existing rows are never
changed. It never runs on its own, so anything an admin deleted stays deleted.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.database import SessionLocal
from app.models.ingredient import Ingredient
from app.models.measurement import Measurement
from app.models.preparation import Preparation

# Lowercase, and singular unless the plural is the usual name (peas, lentils).
MEASUREMENTS = (
    "teaspoon", "tablespoon", "cup", "fluid ounce", "pint", "quart", "gallon", "milliliter", "liter",
    "ounce", "pound", "gram", "kilogram",
    "pinch", "dash", "clove", "can", "jar", "package", "stick", "slice", "bunch", "sprig", "head",
    "piece", "handful", "whole", "to taste",
)  # fmt: skip

PREPARATIONS = (
    "chopped", "finely chopped", "roughly chopped", "diced", "minced", "sliced", "thinly sliced",
    "julienned", "cubed", "grated", "shredded", "zested", "juiced", "peeled", "seeded", "crushed",
    "mashed", "melted", "softened", "cold", "room temperature", "beaten", "toasted", "drained",
    "rinsed", "divided", "packed", "sifted", "halved", "quartered",
)  # fmt: skip

INGREDIENTS = (
    # fats and oils
    "butter", "unsalted butter", "olive oil", "vegetable oil", "canola oil", "sesame oil", "coconut oil",
    # baking
    "flour", "bread flour", "whole wheat flour", "cornstarch", "sugar", "brown sugar", "powdered sugar",
    "honey", "maple syrup", "baking soda", "baking powder", "yeast", "vanilla extract", "cocoa powder",
    "chocolate chips", "rolled oats", "cornmeal",
    # dairy and eggs
    "egg", "milk", "buttermilk", "heavy cream", "sour cream", "plain yogurt", "cream cheese",
    "cheddar", "mozzarella", "parmesan", "feta",
    # produce
    "onion", "red onion", "shallot", "garlic", "green onion", "ginger", "carrot", "celery",
    "bell pepper", "jalapeño", "tomato", "cherry tomato", "potato", "sweet potato", "zucchini",
    "mushroom", "spinach", "kale", "lettuce", "cabbage", "broccoli", "cauliflower", "cucumber",
    "corn", "green beans", "peas", "avocado", "lemon", "lime", "orange", "apple", "banana",
    # herbs and spices
    "salt", "kosher salt", "black pepper", "red pepper flakes", "cayenne pepper", "paprika",
    "smoked paprika", "chili powder", "cumin", "coriander", "turmeric", "cinnamon", "nutmeg",
    "oregano", "dried thyme", "bay leaf", "garlic powder", "onion powder", "curry powder",
    "basil", "parsley", "cilantro", "thyme", "rosemary", "dill", "mint", "chives",
    # pantry
    "chicken stock", "vegetable stock", "beef stock", "canned tomatoes", "tomato paste",
    "tomato sauce", "coconut milk", "black beans", "chickpeas", "kidney beans", "lentils",
    "soy sauce", "fish sauce", "worcestershire sauce", "hot sauce", "dijon mustard", "mayonnaise",
    "ketchup", "white vinegar", "apple cider vinegar", "red wine vinegar", "balsamic vinegar",
    "rice vinegar", "peanut butter", "breadcrumbs", "white wine", "red wine",
    # grains and pasta
    "rice", "brown rice", "spaghetti", "penne", "egg noodles", "quinoa", "bread", "tortilla",
    # proteins
    "chicken breast", "chicken thigh", "ground beef", "ground pork", "bacon", "sausage",
    "pork chop", "steak", "salmon", "shrimp", "tofu",
    # nuts and seeds
    "almonds", "walnuts", "pecans", "peanuts", "sesame seeds",
)  # fmt: skip


def seed_lookups(db: Session) -> dict[str, int]:
    """Add the starter names missing from each table; returns how many were added per table.

    Doesn't commit, so a caller seeding more on top saves or rolls back all of it together."""
    added = {}
    for model, names in ((Measurement, MEASUREMENTS), (Preparation, PREPARATIONS), (Ingredient, INGREDIENTS)):
        # The name columns compare case-insensitively (NOCASE), so "Cup" counts as "cup".
        missing = [name for name in names if db.scalar(select(model.id).where(model.name == name)) is None]
        db.add_all(model(name=name) for name in missing)
        added[model.__tablename__] = len(missing)
    return added


def main() -> None:
    with SessionLocal() as db:
        added = seed_lookups(db)
        db.commit()
        for table, count in added.items():
            print(f"{table}: added {count}")


if __name__ == "__main__":
    main()
