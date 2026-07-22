from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cookbook import Cookbook
from app.schemas.cookbook import CookbookCreate, CookbookUpdate


def get_cookbook(db: Session, cookbook_id: int) -> Cookbook | None:
    return db.get(Cookbook, cookbook_id)


def get_cookbooks(db: Session) -> Sequence[Cookbook]:
    return db.execute(select(Cookbook)).scalars().all()


def create_cookbook(db: Session, cookbook_in: CookbookCreate) -> Cookbook:
    db_model = Cookbook(**cookbook_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_cookbook(db: Session, cookbook: Cookbook, cookbook_in: CookbookUpdate) -> Cookbook:
    for field, value in  cookbook_in.model_dump(exclude_unset=True).items():
        setattr(cookbook, field, value)
    db.commit()
    db.refresh(cookbook)
    return cookbook


def delete_cookbook(db: Session, cookbook: Cookbook) -> None:
    db.delete(cookbook)
    db.commit()
