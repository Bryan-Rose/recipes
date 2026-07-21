from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.schemas.ingredient import IngredientCreate, IngredientUpdate


def get_ingredient(db: Session, ingredient_id: int) -> Ingredient | None:
    return db.get(Ingredient, ingredient_id)


def get_ingredients(db: Session) -> Sequence[Ingredient]:
    return db.execute(select(Ingredient)).scalars().all()


def create_ingredient(db: Session, ingredient_in: IngredientCreate) -> Ingredient:
    db_model = Ingredient(**ingredient_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_ingredient(db: Session, ingredient: Ingredient, ingredient_in: IngredientUpdate) -> Ingredient:
    for field, value in  ingredient_in.model_dump(exclude_unset=True).items():
        setattr(ingredient, field, value)
    db.commit()
    db.refresh(ingredient)
    return ingredient


def delete_ingredient(db: Session, ingredient: Ingredient) -> None:
    db.delete(ingredient)
    db.commit()
