from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.author import Author
from app.schemas.author import AuthorCreate, AuthorUpdate


def get_author(db: Session, author_id: int) -> Author | None:
    return db.get(Author, author_id)


def get_authors(db: Session) -> Sequence[Author]:
    return db.execute(select(Author)).scalars().all()


def create_author(db: Session, author_in: AuthorCreate) -> Author:
    db_model = Author(**author_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_author(db: Session, author: Author, author_in: AuthorUpdate) -> Author:
    for field, value in author_in.model_dump(exclude_unset=True).items():
        setattr(author, field, value)
    db.commit()
    db.refresh(author)
    return author


def delete_author(db: Session, author: Author) -> None:
    db.delete(author)
    db.commit()
