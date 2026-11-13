from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.author import Author
    from app.models.recipe import Recipe


class Cookbook(Base):
    __tablename__ = "cookbooks"
    # One author can't have two books of the same name; different authors can.
    __table_args__ = (UniqueConstraint("name", "author_id", name="uq_cookbooks_name_author_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    name: Mapped[str] = mapped_column(String(collation="NOCASE"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"), nullable=False)
    # Generated name of the cover's files (services/images.py), as on Recipe.
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    author: Mapped[Author] = relationship(back_populates="cookbooks")
    recipes: Mapped[list[Recipe]] = relationship(back_populates="cookbook")
    if TYPE_CHECKING:
        recipe_count: int  # a column_property set in models/__init__.py, once Recipe exists
