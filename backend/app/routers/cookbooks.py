from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.cookbook import CookbookRead, CookbookCreate, CookbookUpdate
from app.services import cookbooks as cookbooks_service

router = APIRouter(prefix="/cookbooks", tags=["cookbooks"])


@router.get("/", response_model=list[CookbookRead])
def list_cookbooks(db: Session = Depends(get_db)):
    return cookbooks_service.get_cookbooks(db)


@router.get("/{cookbook_id}", response_model=CookbookRead)
def get_cookbook(cookbook_id: int, db: Session = Depends(get_db)):
    response = cookbooks_service.get_cookbook(db, cookbook_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=CookbookRead, status_code=status.HTTP_201_CREATED)
def create_cookbook(cookbook_in: CookbookCreate, db: Session = Depends(get_db)):
    return cookbooks_service.create_cookbook(db, cookbook_in)


@router.patch("/{cookbook_id}", response_model=CookbookRead)
def update_cookbook(cookbook_id: int, cookbook_in: CookbookUpdate, db: Session = Depends(get_db)):
    existing = cookbooks_service.get_cookbook(db, cookbook_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return cookbooks_service.update_cookbook(db, existing, cookbook_in)


@router.delete("/{cookbook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cookbook(cookbook_id: int, db: Session = Depends(get_db)):
    existing = cookbooks_service.get_cookbook(db, cookbook_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    cookbooks_service.delete_cookbook(db, existing)
