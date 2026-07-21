from typing import TYPE_CHECKING
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.recipe import RecipeIngredient
    from app.models.cookbook import Cookbook
    from app.models.measurement import Measurement
    from app.models.ingredient import Ingredient
    from app.models.preparation import Preparation


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    cookbook_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("cookbooks.id"), nullable=True
    )
    cookbook_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_cook_time: Mapped[str] = mapped_column(String, nullable=True)
    inactive_cook_time: Mapped[str] = mapped_column(String, nullable=True)
    servings: Mapped[str] = mapped_column(String, nullable=True)
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
    cookbook: Mapped["Cookbook | None"] = relationship(back_populates="recipes")
    requirements: Mapped[list["Requirement"]] = relationship(back_populates="recipe")
    steps: Mapped[list["Step"]] = relationship(back_populates="recipe")


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)


class Step(Base):
    __tablename__ = "steps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    text: Mapped[str] = mapped_column(String, nullable=False)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id"), nullable=False
    )
    recipe: Mapped["Recipe"] = relationship(back_populates="steps")


class Requirement(Base):
    __tablename__ = "requirements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    recipe: Mapped["Recipe"] = relationship(back_populates="requirements")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)

    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id"), nullable=False
    )
    recipe: Mapped["Recipe"] = relationship(back_populates="recipe_ingredients")

    ingredient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredients.id"), nullable=False
    )
    ingredient: Mapped["Ingredient"] = relationship(back_populates="recipe_ingredients")

    preparation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("preparations.id"), nullable=False
    )
    preparation: Mapped["Preparation"] = relationship()

    measurement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("measurements.id"), nullable=False
    )
    measurement: Mapped["Measurement"] = relationship(
        back_populates="recipe_ingredients"
    )
