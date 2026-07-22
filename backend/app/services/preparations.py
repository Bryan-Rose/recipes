from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.preparation import Preparation
from app.schemas.preparation import PreparationCreate, PreparationUpdate


def get_preparation(db: Session, preparation_id: int) -> Preparation | None:
    return db.get(Preparation, preparation_id)


def get_preparations(db: Session) -> Sequence[Preparation]:
    return db.execute(select(Preparation)).scalars().all()


def create_preparation(db: Session, preparation_in: PreparationCreate) -> Preparation:
    db_model = Preparation(**preparation_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_preparation(db: Session, preparation: Preparation, preparation_in: PreparationUpdate) -> Preparation:
    for field, value in  preparation_in.model_dump(exclude_unset=True).items():
        setattr(preparation, field, value)
    db.commit()
    db.refresh(preparation)
    return preparation


def delete_preparation(db: Session, preparation: Preparation) -> None:
    db.delete(preparation)
    db.commit()
