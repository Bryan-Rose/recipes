from sqlalchemy import func, select
from sqlalchemy.orm import column_property

from app.models.author import Author  # noqa: F401
from app.models.cookbook import Cookbook
from app.models.ingredient import Ingredient  # noqa: F401
from app.models.measurement import Measurement  # noqa: F401
from app.models.preparation import Preparation  # noqa: F401
from app.models.recipe import Recipe, RecipeIngredient, Requirement, Step, Tag  # noqa: F401
from app.models.session import UserSession  # noqa: F401
from app.models.user import User  # noqa: F401

# Counted in SQL as part of each cookbook query; defined here because cookbook.py can't import Recipe.
Cookbook.recipe_count = column_property(  # pyright: ignore[reportAttributeAccessIssue]
    select(func.count(Recipe.id)).where(Recipe.cookbook_id == Cookbook.id).correlate_except(Recipe).scalar_subquery()
)
