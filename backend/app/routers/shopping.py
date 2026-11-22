from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.fields import IdPath
from app.schemas.shopping import ShoppingListRead, ShoppingRecipeWrite
from app.services import recipes as recipes_service
from app.services import shopping as shopping_service

# One list, shared by every user, like the recipes themselves.
router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


@router.get("", response_model=ShoppingListRead)
def get_shopping_list(db: Session = Depends(get_db)):
    return shopping_service.get_list(db)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_shopping_list(db: Session = Depends(get_db)):
    shopping_service.clear(db)


@router.put("/recipes/{recipe_id}", response_model=ShoppingListRead)
def put_shopping_recipe(recipe_id: IdPath, body: ShoppingRecipeWrite, db: Session = Depends(get_db)):
    """Adds the recipe to the list, or changes the servings it's shopped for."""
    recipe = recipes_service.get_recipe(db, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    shopping_service.put_recipe(db, recipe, body.servings)
    return shopping_service.get_list(db)


@router.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_shopping_recipe(recipe_id: IdPath, db: Session = Depends(get_db)):
    if not shopping_service.remove_recipe(db, recipe_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


@router.put("/checks/{ingredient_id}/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
def check_line(ingredient_id: IdPath, measurement_id: IdPath, db: Session = Depends(get_db)):
    shopping_service.set_checked(db, ingredient_id, measurement_id, checked=True)


@router.delete("/checks/{ingredient_id}/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
def uncheck_line(ingredient_id: IdPath, measurement_id: IdPath, db: Session = Depends(get_db)):
    shopping_service.set_checked(db, ingredient_id, measurement_id, checked=False)
