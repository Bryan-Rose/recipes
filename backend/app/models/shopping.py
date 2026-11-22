from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.recipe import Recipe


class ShoppingListRecipe(Base):
    """A recipe on the one shopping list everyone shares, at the servings to shop for."""

    __tablename__ = "shopping_list_recipes"

    # CASCADE: deleting a recipe takes it off the list rather than failing as still in use.
    recipe_id: Mapped[int] = mapped_column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True)
    servings: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None: as written
    recipe: Mapped[Recipe] = relationship()


class ShoppingListCheck(Base):
    """A shopping list line ticked off. Lines are one per ingredient and measurement."""

    __tablename__ = "shopping_list_checks"

    # CASCADE: a tick never keeps a lookup row from being deleted.
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True)
    measurement_id: Mapped[int] = mapped_column(Integer, ForeignKey("measurements.id", ondelete="CASCADE"), primary_key=True)
