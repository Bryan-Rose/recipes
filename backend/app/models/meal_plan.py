from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.recipe import Recipe


class PlannedMeal(Base):
    """A recipe planned for a day, on the one meal plan everyone shares."""

    __tablename__ = "planned_meals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # CASCADE: deleting a recipe takes it off the plan rather than failing as still in use.
    recipe_id: Mapped[int] = mapped_column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    servings: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None: as written
    recipe: Mapped[Recipe] = relationship()
