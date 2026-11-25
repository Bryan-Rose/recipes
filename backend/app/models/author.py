from typing import TYPE_CHECKING

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.cookbook import Cookbook
    from app.models.recipe import Recipe


class Author(Base):
    __tablename__ = "authors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(collation="NOCASE"), unique=True, index=True, nullable=False)
    cookbooks: Mapped[list[Cookbook]] = relationship(back_populates="author")
    # Those without a cookbook. passive_deletes="all": leave author_id alone, so deleting an author
    # still named by a recipe fails on the foreign key (a 409) instead of quietly unsetting it.
    recipes: Mapped[list[Recipe]] = relationship(back_populates="author", passive_deletes="all")
