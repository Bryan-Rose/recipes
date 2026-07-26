from collections.abc import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.recipe import Recipe, RecipeIngredient, Step, Requirement
from app.schemas.recipes import RecipeCreate, RecipeUpdate
from app.schemas.recipes import StepCreate, StepUpdate
from app.schemas.recipes import RequirementCreate, RequirementUpdate


_RECIPE_LOAD_OPTIONS = [
    selectinload(Recipe.steps),
    selectinload(Recipe.requirements),
    selectinload(Recipe.cookbook),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.preparation),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.measurement),
]

_EXCLUDE_NESTED = ["steps", "requirements", "recipe_ingredients"]


## Recipe


def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.get(Recipe, recipe_id, options=_RECIPE_LOAD_OPTIONS)


def get_recipes(db: Session) -> Sequence[Recipe]:
    return db.execute(select(Recipe).options(*_RECIPE_LOAD_OPTIONS)).scalars().all()


def create_recipe(db: Session, recipe_in: RecipeCreate, created_user_id: int) -> Recipe:
    db_model = Recipe(**recipe_in.model_dump(exclude={*_EXCLUDE_NESTED}))
    db_model.created_user_id = created_user_id
    db_model.steps = [Step(**step.model_dump()) for step in recipe_in.steps]
    db_model.requirements = [Requirement(**req.model_dump()) for req in recipe_in.requirements]
    db_model.recipe_ingredients = [RecipeIngredient(**ing.model_dump()) for ing in recipe_in.recipe_ingredients]
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_recipe(db: Session, recipe: Recipe, recipe_in: RecipeUpdate) -> Recipe:
    for field, value in recipe_in.model_dump(exclude_unset=True, exclude={*_EXCLUDE_NESTED}).items():
        setattr(recipe, field, value)

    db.commit()
    db.refresh(recipe)
    return recipe


def delete_recipe(db: Session, recipe: Recipe) -> None:
    db.delete(recipe)
    db.commit()


## Recipe

## Step


def create_step(db: Session, recipe_id: int, step_in: StepCreate) -> Step:
    db_model = Step(**step_in.model_dump())
    db_model.recipe_id = recipe_id
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_step(db: Session, step: Step, step_in: StepUpdate) -> Step:
    for field, value in step_in.model_dump(exclude_unset=True).items():
        setattr(step, field, value)

    db.commit()
    db.refresh(step)
    return step


def delete_step(db: Session, step: Step) -> None:
    db.delete(step)
    db.commit()


def get_step(db: Session, recipe_id: int, step_id: int) -> Step | None:
    return db.execute(select(Step).where(Step.recipe_id == recipe_id, Step.id == step_id)).scalar()


def get_steps(db: Session, recipe_id: int) -> Sequence[Step]:
    return db.execute(select(Step).where(Step.recipe_id == recipe_id)).scalars().all()


## Step

## Requirement


def create_requirement(db: Session, recipe_id: int, requirement_in: RequirementCreate) -> Requirement:
    db_model = Requirement(**requirement_in.model_dump())
    db_model.recipe_id = recipe_id
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_requirement(db: Session, requirement: Requirement, requirement_in: RequirementUpdate) -> Requirement:
    for field, value in requirement_in.model_dump(exclude_unset=True).items():
        setattr(requirement, field, value)

    db.commit()
    db.refresh(requirement)
    return requirement


def delete_requirement(db: Session, requirement: Requirement) -> None:
    db.delete(requirement)
    db.commit()


def get_requirement(db: Session, recipe_id: int, requirement_id: int) -> Requirement | None:
    return db.execute(select(Requirement).where(Requirement.recipe_id == recipe_id, Requirement.id == requirement_id)).scalar()


def get_requirements(db: Session, recipe_id: int) -> Sequence[Requirement]:
    return db.execute(select(Requirement).where(Requirement.recipe_id == recipe_id)).scalars().all()


## Requirement
