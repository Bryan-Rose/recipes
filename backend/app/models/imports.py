from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, false
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
    # The recipe saved from this draft, if any; None again once that recipe is deleted.
    recipe_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True, unique=True)
    # Whether a recipe was ever saved from it, so a deleted one isn't shown as never saved.
    saved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())
    source: Mapped[str] = mapped_column(String, nullable=False)  # text, photos or url
    model: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)  # None: model missing from the price table
    outcome: Mapped[str] = mapped_column(String, nullable=False)  # draft, no_draft or cut_off
    # What was sent to Claude, as files under RECIPES_IMPORTS_DIR: {original}-{part}.{txt,jpg,html}, one per photo.
    # None (and 0 parts) for imports from before originals were kept.
    original: Mapped[str | None] = mapped_column(String, nullable=True)
    original_parts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    page_url: Mapped[str | None] = mapped_column(String, nullable=True)  # URL import: where the page ended up after redirects
    recipe: Mapped[Recipe | None] = relationship(back_populates="source_import")
