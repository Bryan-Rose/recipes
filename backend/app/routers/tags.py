from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.tag import TagCreate, TagRead, TagUpdate
from app.services import tags as tags_service

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/", response_model=list[TagRead])
def list_tags(db: Session = Depends(get_db)):
    return tags_service.get_tags(db)


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    response = tags_service.get_tag(db, tag_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(tag_in: TagCreate, db: Session = Depends(get_db)):
    return tags_service.create_tag(db, tag_in)


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: int, tag_in: TagUpdate, db: Session = Depends(get_db)):
    existing = tags_service.get_tag(db, tag_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return tags_service.update_tag(db, existing, tag_in)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    existing = tags_service.get_tag(db, tag_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    tags_service.delete_tag(db, existing)
