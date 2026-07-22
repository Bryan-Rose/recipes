from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.preparation import PreparationCreate, PreparationRead, PreparationUpdate
from app.services import preparations as preparations_service

router = APIRouter(prefix="/preparations", tags=["preparations"])


@router.get("/", response_model=list[PreparationRead])
def list_preparations(db: Session = Depends(get_db)):
    return preparations_service.get_preparations(db)


@router.get("/{preparation_id}", response_model=PreparationRead)
def get_preparation(preparation_id: int, db: Session = Depends(get_db)):
    response = preparations_service.get_preparation(db, preparation_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=PreparationRead, status_code=status.HTTP_201_CREATED)
def create_preparation(preparation_in: PreparationCreate, db: Session = Depends(get_db)):
    return preparations_service.create_preparation(db, preparation_in)


@router.patch("/{preparation_id}", response_model=PreparationRead)
def update_preparation(preparation_id: int, preparation_in: PreparationUpdate, db: Session = Depends(get_db)):
    existing = preparations_service.get_preparation(db, preparation_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return preparations_service.update_preparation(db, existing, preparation_in)


@router.delete("/{preparation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preparation(preparation_id: int, db: Session = Depends(get_db)):
    existing = preparations_service.get_preparation(db, preparation_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    preparations_service.delete_preparation(db, existing)
