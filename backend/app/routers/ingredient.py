from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.ingredient import IngredientCreate, IngredientRead, IngredientUpdate
from app.services import ingredient as ingredient_service

router = APIRouter(prefix="/ingredients", tags=["ingredients"])


@router.get("/", response_model=list[IngredientRead])
def list_ingredients(db: Session = Depends(get_db)):
    return ingredient_service.get_ingredients(db)


@router.get("/{ingredient_id}", response_model=IngredientRead)
def get_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    response = ingredient_service.get_ingredient(db, ingredient_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@router.post("/", response_model=IngredientRead, status_code=status.HTTP_201_CREATED)
def create_ingredient(ingredient_in: IngredientCreate, db: Session = Depends(get_db)):
    return ingredient_service.create_ingredient(db, ingredient_in)


@router.patch("/{ingredient_id}", response_model=IngredientRead)
def update_ingredient(ingredient_id: int, ingredient_in: IngredientUpdate, db: Session = Depends(get_db)):
    existing = ingredient_service.get_ingredient(db, ingredient_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return ingredient_service.update_ingredient(db, existing, ingredient_in)


@router.delete("/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    existing = ingredient_service.get_ingredient(db, ingredient_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    ingredient_service.delete_ingredient(db, existing)
