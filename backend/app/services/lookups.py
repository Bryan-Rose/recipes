"""CRUD for the name-only lookups, shared by every model in routers/lookups.py."""

from collections.abc import Sequence

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session


def get_item[M](db: Session, model: type[M], item_id: int) -> M | None:
    return db.get(model, item_id)


def get_items[M](db: Session, model: type[M]) -> Sequence[M]:
    return db.execute(select(model)).scalars().all()


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
