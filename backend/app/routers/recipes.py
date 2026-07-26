from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recipes import (
    RecipeCreate,
    RecipeIngredientCreate,
    RecipeIngredientRead,
    RecipeIngredientUpdate,
    RecipeRead,
    RecipeUpdate,
    RequirementCreate,
    RequirementRead,
    RequirementUpdate,
    StepCreate,
    StepRead,
    StepUpdate,
)
from app.services import recipes as recipes_service

recipe_router = APIRouter(prefix="/recipes", tags=["recipes"])
step_router = APIRouter(prefix="/recipes/{recipe_id}/steps", tags=["steps"])
requirement_router = APIRouter(prefix="/recipes/{recipe_id}/requirements", tags=["requirements"])
recipe_ingredient_router = APIRouter(prefix="/recipes/{recipe_id}/recipeingredients", tags=["recipeingredients"])


## Recipes


@recipe_router.get("/", response_model=list[RecipeRead])
def list_recipes(db: Session = Depends(get_db)):
    return recipes_service.get_recipes(db)


@recipe_router.get("/{recipe_id}", response_model=RecipeRead)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    response = recipes_service.get_recipe(db, recipe_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@recipe_router.post("/", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def create_recipe(recipe_in: RecipeCreate, db: Session = Depends(get_db)):
    placeholder_created_user_id = 999
    return recipes_service.create_recipe(db, recipe_in, placeholder_created_user_id)


@recipe_router.patch("/{recipe_id}", response_model=RecipeRead)
def update_recipe(recipe_id: int, recipe_in: RecipeUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.update_recipe(db, existing, recipe_in)


@recipe_router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.delete_recipe(db, existing)


## Recipes


## Steps


@step_router.get("/", response_model=list[StepRead])
def list_steps(recipe_id: int, db: Session = Depends(get_db)):
    return recipes_service.get_steps(db, recipe_id)


@step_router.get("/{step_id}", response_model=StepRead)
def get_step(recipe_id: int, step_id: int, db: Session = Depends(get_db)):
    response = recipes_service.get_step(db, recipe_id, step_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@step_router.post("/", response_model=StepRead, status_code=status.HTTP_201_CREATED)
def create_step(recipe_id: int, step_in: StepCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_step(db, recipe_id, step_in)


@step_router.patch("/{step_id}", response_model=StepRead)
def update_step(recipe_id: int, step_id: int, step_in: StepUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_step(db, recipe_id, step_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.update_step(db, existing, step_in)


@step_router.delete("/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_step(recipe_id: int, step_id: int, db: Session = Depends(get_db)):
    existing = recipes_service.get_step(db, recipe_id, step_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.delete_step(db, existing)


## Steps


## Requirements


@requirement_router.get("/", response_model=list[RequirementRead])
def list_requirements(recipe_id: int, db: Session = Depends(get_db)):
    return recipes_service.get_requirements(db, recipe_id)


@requirement_router.get("/{requirement_id}", response_model=RequirementRead)
def get_requirement(recipe_id: int, requirement_id: int, db: Session = Depends(get_db)):
    response = recipes_service.get_requirement(db, recipe_id, requirement_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@requirement_router.post("/", response_model=RequirementRead, status_code=status.HTTP_201_CREATED)
def create_requirement(recipe_id: int, requirement_in: RequirementCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_requirement(db, recipe_id, requirement_in)


@requirement_router.patch("/{requirement_id}", response_model=RequirementRead)
def update_requirement(recipe_id: int, requirement_id: int, requirement_in: RequirementUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_requirement(db, recipe_id, requirement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.update_requirement(db, existing, requirement_in)


@requirement_router.delete("/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement(recipe_id: int, requirement_id: int, db: Session = Depends(get_db)):
    existing = recipes_service.get_requirement(db, recipe_id, requirement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.delete_requirement(db, existing)


## Requirements


## Recipe Ingredients


@recipe_ingredient_router.get("/", response_model=list[RecipeIngredientRead])
def list_recipe_ingredient(recipe_id: int, db: Session = Depends(get_db)):
    return recipes_service.get_recipe_ingredients(db, recipe_id)


@recipe_ingredient_router.get("/{ri_id}", response_model=RecipeIngredientRead)
def get_recipe_ingredient(recipe_id: int, ri_id: int, db: Session = Depends(get_db)):
    response = recipes_service.get_recipe_ingredient(db, recipe_id, ri_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@recipe_ingredient_router.post("/", response_model=RecipeIngredientRead, status_code=status.HTTP_201_CREATED)
def create_recipe_ingredient(recipe_id: int, ri_in: RecipeIngredientCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_recipe_ingredient(db, recipe_id, ri_in)


@recipe_ingredient_router.patch("/{ri_id}", response_model=RecipeIngredientRead)
def update_recipe_ingredient(recipe_id: int, ri_id: int, ri_in: RecipeIngredientUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe_ingredient(db, recipe_id, ri_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.update_recipe_ingredient(db, existing, ri_in)


@recipe_ingredient_router.delete("/{ri_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe_ingredient(recipe_id: int, ri_id: int, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe_ingredient(db, recipe_id, ri_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.delete_recipe_ingredient(db, existing)


## Recipe Ingredients
