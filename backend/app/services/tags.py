from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recipe import Tag
from app.schemas.tag import TagCreate, TagUpdate


def get_tag(db: Session, tag_id: int) -> Tag | None:
    return db.get(Tag, tag_id)


def get_tags(db: Session) -> Sequence[Tag]:
    return db.execute(select(Tag)).scalars().all()


def create_tag(db: Session, tag_in: TagCreate) -> Tag:
    db_model = Tag(**tag_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_tag(db: Session, tag: Tag, tag_in: TagUpdate) -> Tag:
    for field, value in tag_in.model_dump(exclude_unset=True).items():
        setattr(tag, field, value)
    db.commit()
    db.refresh(tag)
    return tag


def delete_tag(db: Session, tag: Tag) -> None:
    db.delete(tag)
    db.commit()
