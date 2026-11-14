from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.fields import IdPath
from app.schemas.recipes import (
    ImageUpload,
    RecipeCreate,
    RecipeIngredientCreate,
    RecipeIngredientRead,
    RecipeIngredientUpdate,
    RecipeRead,
    RecipeSummary,
    RecipeUpdate,
    RequirementCreate,
    RequirementRead,
    RequirementUpdate,
    StepCreate,
    StepOrder,
    StepRead,
    StepUpdate,
)
from app.services import recipes as recipes_service
from app.services.lookups import delete_item, update_item

recipe_router = APIRouter(prefix="/recipes", tags=["recipes"])
step_router = APIRouter(prefix="/recipes/{recipe_id}/steps", tags=["steps"])
requirement_router = APIRouter(prefix="/recipes/{recipe_id}/requirements", tags=["requirements"])
recipe_ingredient_router = APIRouter(prefix="/recipes/{recipe_id}/recipeingredients", tags=["recipeingredients"])


## Recipes


@recipe_router.get("/", response_model=list[RecipeSummary])
def list_recipes(db: Session = Depends(get_db)):
    return recipes_service.get_recipes(db)


@recipe_router.get("/{recipe_id}", response_model=RecipeRead)
def get_recipe(recipe_id: IdPath, db: Session = Depends(get_db)):
    response = recipes_service.get_recipe(db, recipe_id)
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return response


@recipe_router.post("/", response_model=RecipeRead, status_code=status.HTTP_201_CREATED)
def create_recipe(
    recipe_in: RecipeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    try:
        return recipes_service.create_recipe(db, recipe_in, user.id, settings.images_dir)
    except recipes_service.UnknownTagError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Unknown tag ids: {e.args[0]}")


@recipe_router.patch("/{recipe_id}", response_model=RecipeRead)
def update_recipe(recipe_id: IdPath, recipe_in: RecipeUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    try:
        return recipes_service.update_recipe(db, existing, recipe_in)
    except recipes_service.UnknownTagError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Unknown tag ids: {e.args[0]}")
    except recipes_service.PageWithoutCookbookError:
        # Same body shape as a schema validation 422, which is what OpenAPI documents.
        msg = "cookbook_page requires a cookbook_id"
        raise RequestValidationError(
            [{"type": "value_error", "loc": ("body", "cookbook_page"), "msg": msg, "input": recipe_in.cookbook_page}]
        )


@recipe_router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: IdPath, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.delete_recipe(db, existing, settings.images_dir)


@recipe_router.put("/{recipe_id}/image", response_model=RecipeRead)
def put_recipe_image(recipe_id: IdPath, image_in: ImageUpload, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.set_image(db, existing, settings.images_dir, image_in)


@recipe_router.delete("/{recipe_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe_image(recipe_id: IdPath, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    existing = recipes_service.get_recipe(db, recipe_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    recipes_service.set_image(db, existing, settings.images_dir, None)


## Recipes


## Steps


@step_router.post("/", response_model=StepRead, status_code=status.HTTP_201_CREATED)
def create_step(recipe_id: IdPath, step_in: StepCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_step(db, existing_recipe, step_in)


@recipe_router.put("/{recipe_id}/step-order", response_model=list[StepRead], tags=["steps"])
def reorder_steps(recipe_id: IdPath, order_in: StepOrder, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    try:
        return recipes_service.reorder_steps(db, existing_recipe, order_in)
    except recipes_service.StepOrderMismatchError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="step_ids must list every step of the recipe exactly once")


@step_router.patch("/{step_id}", response_model=StepRead)
def update_step(recipe_id: IdPath, step_id: IdPath, step_in: StepUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_step(db, recipe_id, step_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return update_item(db, existing, step_in)


@step_router.delete("/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_step(recipe_id: IdPath, step_id: IdPath, db: Session = Depends(get_db)):
    existing = recipes_service.get_step(db, recipe_id, step_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    delete_item(db, existing)


## Steps


## Requirements


@requirement_router.post("/", response_model=RequirementRead, status_code=status.HTTP_201_CREATED)
def create_requirement(recipe_id: IdPath, requirement_in: RequirementCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_requirement(db, recipe_id, requirement_in)


@requirement_router.patch("/{requirement_id}", response_model=RequirementRead)
def update_requirement(recipe_id: IdPath, requirement_id: IdPath, requirement_in: RequirementUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_requirement(db, recipe_id, requirement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return update_item(db, existing, requirement_in)


@requirement_router.delete("/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement(recipe_id: IdPath, requirement_id: IdPath, db: Session = Depends(get_db)):
    existing = recipes_service.get_requirement(db, recipe_id, requirement_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    delete_item(db, existing)


## Requirements


## Recipe Ingredients


@recipe_ingredient_router.post("/", response_model=RecipeIngredientRead, status_code=status.HTTP_201_CREATED)
def create_recipe_ingredient(recipe_id: IdPath, ri_in: RecipeIngredientCreate, db: Session = Depends(get_db)):
    existing_recipe = recipes_service.get_recipe(db, recipe_id)
    if existing_recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.create_recipe_ingredient(db, recipe_id, ri_in)


@recipe_ingredient_router.patch("/{ri_id}", response_model=RecipeIngredientRead)
def update_recipe_ingredient(recipe_id: IdPath, ri_id: IdPath, ri_in: RecipeIngredientUpdate, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe_ingredient(db, recipe_id, ri_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return recipes_service.update_recipe_ingredient(db, existing, ri_in)


@recipe_ingredient_router.delete("/{ri_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe_ingredient(recipe_id: IdPath, ri_id: IdPath, db: Session = Depends(get_db)):
    existing = recipes_service.get_recipe_ingredient(db, recipe_id, ri_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    delete_item(db, existing)


## Recipe Ingredients
