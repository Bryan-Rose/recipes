from typing import TYPE_CHECKING
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.recipe import RecipeIngredient


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    cookbook: Mapped[str] = mapped_column(String)
    cookbook_author: Mapped[str] = mapped_column(String)
    cookbook_page: Mapped[int] = mapped_column(Integer)
    estimated_time: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_user: Mapped["User"] = relationship(back_populates="recipes")
    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe"
    )


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)


class Step(Base):
    __tablename__ = "steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    text: Mapped[str] = mapped_column(String, nullable=False)


class Requirement(Base):
    __tablename__ = "requirements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)


class Ingredient(Base):
    __tablename__ = "ingredients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="ingredient"
    )


class Measurement(Base):
    __tablename__ = "measurements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="measurement"
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id"), nullable=False
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredients.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    measurement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("measurements.id"), nullable=False
    )
    recipe: Mapped["Recipe"] = relationship(back_populates="recipe_ingredients")
    ingredient: Mapped["Ingredient"] = relationship(back_populates="recipe_ingredients")
    measurement: Mapped["Measurement"] = relationship(back_populates="recipe_ingredients")
