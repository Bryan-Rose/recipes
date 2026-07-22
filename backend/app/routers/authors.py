from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.author import AuthorCreate, AuthorRead, AuthorUpdate
from app.services import authors as authors_service

router = APIRouter(prefix="/authors", tags=["authors"])


@router.get("/", response_model=list[AuthorRead])
def list_authors(db: Session = Depends(get_db)):
    return authors_service.get_authors(db)


@router.get("/{author_id}", response_model=AuthorRead)
def get_author(author_id: int, db: Session = Depends(get_db)):
    response = authors_service.get_author(db, author_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=AuthorRead, status_code=status.HTTP_201_CREATED)
def create_author(author_in: AuthorCreate, db: Session = Depends(get_db)):
    return authors_service.create_author(db, author_in)


@router.patch("/{author_id}", response_model=AuthorRead)
def update_author(author_id: int, author_in: AuthorUpdate, db: Session = Depends(get_db)):
    existing = authors_service.get_author(db, author_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return authors_service.update_author(db, existing, author_in)


@router.delete("/{author_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_author(author_id: int, db: Session = Depends(get_db)):
    existing = authors_service.get_author(db, author_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    authors_service.delete_author(db, existing)
