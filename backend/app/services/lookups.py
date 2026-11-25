"""Generic CRUD: the name-only lookups in routers/lookups.py, plus update/delete for recipe children."""

from collections.abc import Sequence

from pydantic import BaseModel
from sqlalchemy import Column, delete, select, update
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.models import Author, Cookbook, Ingredient, Measurement, Preparation, Recipe, RecipeIngredient, Tag
from app.models.recipe import recipe_tags


def get_item[M](db: Session, model: type[M], item_id: int) -> M | None:
    return db.get(model, item_id)


def get_items[M](db: Session, model: type[M]) -> Sequence[M]:
    # NOCASE names, so the order ignores case.
    return db.execute(select(model).order_by(model.name)).scalars().all()  # pyright: ignore[reportAttributeAccessIssue]  every lookup has a name


def create_item[M](db: Session, model: type[M], item_in: BaseModel) -> M:
    db_model = model(**item_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_item[M](db: Session, item: M, item_in: BaseModel) -> M:
    for field, value in item_in.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item: object) -> None:
    db.delete(item)
    db.commit()


class MergeIntoItselfError(Exception):
    pass


# For each lookup, the columns that name one of its rows; merge_item points them all at the kept row.
_REFERENCES: dict[type, list[InstrumentedAttribute | Column]] = {
    Ingredient: [RecipeIngredient.ingredient_id],
    Measurement: [RecipeIngredient.measurement_id],
    Preparation: [RecipeIngredient.preparation_id],
    Author: [Cookbook.author_id, Recipe.author_id],
    Tag: [recipe_tags.c.tag_id],
}


def merge_item[M: Author | Ingredient | Measurement | Preparation | Tag](db: Session, model: type[M], item: M, into: M) -> M:
    """Points everything that names item at into instead and deletes item, in one transaction.

    A clash the kept row can't take (an author with a cookbook of the same name) fails as a 409 with nothing changed.
    """
    if item.id == into.id:
        raise MergeIntoItselfError
    old, kept = item.id, into.id
    if model is Tag:
        # A recipe with both tags keeps the kept one, once.
        both = select(recipe_tags.c.recipe_id).where(recipe_tags.c.tag_id == kept)
        db.execute(delete(recipe_tags).where(recipe_tags.c.tag_id == old, recipe_tags.c.recipe_id.in_(both)))
    for column in _REFERENCES[model]:
        db.execute(update(column.table).where(column == old).values({column.name: kept}))
    # Its shopping list ticks go with it (ON DELETE CASCADE) rather than move: they're keyed by ingredient and
    # measurement, so they could clash with the kept row's, and the merged line then shows as still to buy.
    db.execute(delete(model).where(model.id == old))
    db.commit()
    db.refresh(into)
    return into
