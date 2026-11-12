from collections.abc import Sequence
from fractions import Fraction
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.recipe import Recipe, RecipeIngredient, Requirement, Step, Tag
from app.schemas.recipes import (
    ImageUpload,
    RecipeCreate,
    RecipeIngredientCreate,
    RecipeIngredientUpdate,
    RecipeUpdate,
    RequirementCreate,
    RequirementUpdate,
    StepCreate,
    StepOrder,
    StepUpdate,
)
from app.services import images

_RECIPE_LOAD_OPTIONS = [
    selectinload(Recipe.steps),
    selectinload(Recipe.requirements),
    selectinload(Recipe.cookbook),
    selectinload(Recipe.tags),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.preparation),
    selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.measurement),
]

_EXCLUDE_NESTED = ["steps", "requirements", "recipe_ingredients", "tag_ids", "image"]


class UnknownTagError(Exception):
    pass


class StepOrderMismatchError(Exception):
    pass


class PageWithoutCookbookError(Exception):
    pass


def _get_tags(db: Session, tag_ids: list[int]) -> list[Tag]:
    tags = list(db.execute(select(Tag).where(Tag.id.in_(tag_ids))).scalars())
    missing = set(tag_ids) - {tag.id for tag in tags}
    if missing:
        raise UnknownTagError(sorted(missing))
    return tags


def _reduce(ri: RecipeIngredient) -> RecipeIngredient:
    """Store each amount one way only: 4/8 becomes 1/2."""
    amount = Fraction(ri.amount_numerator, ri.amount_denominator)
    ri.amount_numerator, ri.amount_denominator = amount.numerator, amount.denominator
    return ri


## Recipe


def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.get(Recipe, recipe_id, options=_RECIPE_LOAD_OPTIONS)


def get_recipes(db: Session) -> Sequence[Recipe]:
    # Only what RecipeSummary reads.
    options = [
        selectinload(Recipe.cookbook),
        selectinload(Recipe.tags),
        selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient),
    ]
    return db.execute(select(Recipe).options(*options)).scalars().all()


def create_recipe(db: Session, recipe_in: RecipeCreate, created_user_id: int, images_dir: Path) -> Recipe:
    db_model = Recipe(**recipe_in.model_dump(exclude={*_EXCLUDE_NESTED}))
    db_model.created_user_id = created_user_id
    db_model.steps = [Step(**step.model_dump()) for step in recipe_in.steps]
    db_model.requirements = [Requirement(**req.model_dump()) for req in recipe_in.requirements]
    db_model.recipe_ingredients = [_reduce(RecipeIngredient(**ing.model_dump())) for ing in recipe_in.recipe_ingredients]
    db_model.tags = _get_tags(db, recipe_in.tag_ids)
    db_model.image = images.save(images_dir, recipe_in.image) if recipe_in.image else None
    db.add(db_model)
    images.commit(db, images_dir, db_model.image)
    db.refresh(db_model)
    return db_model


def update_recipe(db: Session, recipe: Recipe, recipe_in: RecipeUpdate) -> Recipe:
    changes = recipe_in.model_dump(exclude_unset=True, exclude={*_EXCLUDE_NESTED})
    # Checked against the stored recipe, since a PATCH may send only one of the two fields.
    if changes.get("cookbook_id", recipe.cookbook_id) is None:
        if changes.get("cookbook_page") is not None:
            raise PageWithoutCookbookError
        if "cookbook_id" in changes:
            changes["cookbook_page"] = None  # removing the cookbook drops its page, as the UI does
    for field, value in changes.items():
        setattr(recipe, field, value)
    if recipe_in.tag_ids is not None:
        recipe.tags = _get_tags(db, recipe_in.tag_ids)

    db.commit()
    db.refresh(recipe)
    return recipe


def delete_recipe(db: Session, recipe: Recipe, images_dir: Path) -> None:
    image = recipe.image
    db.delete(recipe)
    db.commit()
    images.delete(images_dir, image)


def set_image(db: Session, recipe: Recipe, images_dir: Path, upload: ImageUpload | None) -> Recipe:
    images.replace(db, recipe, images_dir, upload)
    return recipe


## Recipe

## Step


def create_step(db: Session, recipe: Recipe, step_in: StepCreate) -> Step:
    db_model = Step(**step_in.model_dump())
    recipe.steps.append(db_model)
    # append numbers it len(steps), which can sit below a later step after deletes left gaps.
    recipe.steps.reorder()  # pyright: ignore[reportAttributeAccessIssue]  # an ordering_list at runtime
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
    return db.execute(select(Step).where(Step.recipe_id == recipe_id).order_by(Step.position, Step.id)).scalars().all()


def reorder_steps(db: Session, recipe: Recipe, order_in: StepOrder) -> list[Step]:
    by_id = {step.id: step for step in recipe.steps}
    # A list that no longer matches (a step added or removed since the client loaded) is refused, not merged.
    # shortcut: no lock, so a step added between this check and the commit is not refused; it keeps its
    # (last) position and is missing from the response. Lock or re-check in the transaction if that matters.
    if sorted(order_in.step_ids) != sorted(by_id):
        raise StepOrderMismatchError
    recipe.steps = [by_id[step_id] for step_id in order_in.step_ids]
    recipe.steps.reorder()  # pyright: ignore[reportAttributeAccessIssue]  # an ordering_list at runtime
    db.commit()
    return list(recipe.steps)


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


## Recipe Ingredients


def create_recipe_ingredient(db: Session, recipe_id: int, ri_in: RecipeIngredientCreate) -> RecipeIngredient:
    db_model = _reduce(RecipeIngredient(**ri_in.model_dump()))
    db_model.recipe_id = recipe_id
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_recipe_ingredient(db: Session, recipe_ingredient: RecipeIngredient, ri_in: RecipeIngredientUpdate) -> RecipeIngredient:
    for field, value in ri_in.model_dump(exclude_unset=True).items():
        setattr(recipe_ingredient, field, value)
    _reduce(recipe_ingredient)

    db.commit()
    db.refresh(recipe_ingredient)
    return recipe_ingredient


def delete_recipe_ingredient(db: Session, recipe_ingredient: RecipeIngredient) -> None:
    db.delete(recipe_ingredient)
    db.commit()


def get_recipe_ingredient(db: Session, recipe_id: int, recipe_ingredient_id: int) -> RecipeIngredient | None:
    return db.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id, RecipeIngredient.id == recipe_ingredient_id)
    ).scalar()


def get_recipe_ingredients(db: Session, recipe_id: int) -> Sequence[RecipeIngredient]:
    return db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id)).scalars().all()


## Recipe Ingredients
