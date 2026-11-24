from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.recipe import Recipe


class RecipeImportRecord(Base):
    """One Claude parse and what it cost, kept for the cost history."""

    __tablename__ = "recipe_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    # SET NULL: deleting the user or the recipe keeps what the import cost.
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # The recipe saved from this draft, if any.
    recipe_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True, unique=True)
    source: Mapped[str] = mapped_column(String, nullable=False)  # text, photos or url
    model: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)  # None: model missing from the price table
    outcome: Mapped[str] = mapped_column(String, nullable=False)  # draft, no draft or cut off
    recipe: Mapped[Recipe | None] = relationship(back_populates="source_import")
