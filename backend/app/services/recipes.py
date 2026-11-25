from collections.abc import Sequence
from fractions import Fraction
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.models.imports import RecipeImportRecord
from app.models.recipe import Recipe, RecipeIngredient, Requirement, Step, Tag
from app.schemas.recipes import (
    ImageUpload,
    RecipeCreate,
    RecipeIngredientCreate,
    RecipeIngredientOrder,
    RecipeIngredientUpdate,
    RecipeUpdate,
    RequirementCreate,
    RequirementOrder,
    StepCreate,
    StepOrder,
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

_EXCLUDE_NESTED = ["steps", "requirements", "recipe_ingredients", "tag_ids", "image", "import_id"]


class UnknownTagError(Exception):
    pass


class UnknownImportError(Exception):
    """No such import, or a recipe was already saved from it."""


class OrderMismatchError(Exception):
    """The ids sent aren't exactly the recipe's lines."""


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
    db.add(db_model)
    if recipe_in.import_id is not None:
        db.flush()  # for the recipe's id
        # One conditional UPDATE, so two saves of the same draft can't both claim it.
        claimed = db.execute(
            update(RecipeImportRecord)
            .where(RecipeImportRecord.id == recipe_in.import_id, RecipeImportRecord.recipe_id.is_(None))
            .values(recipe_id=db_model.id, saved=True)
        )
        if claimed.rowcount == 0:  # pyright: ignore[reportAttributeAccessIssue]
            db.rollback()
            raise UnknownImportError
    db_model.image = images.save(images_dir, recipe_in.image) if recipe_in.image else None
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


def _append[T: Step | Requirement | RecipeIngredient](db: Session, lines: list[T], line: T) -> T:
    lines.append(line)
    # append numbers it len(lines), which can sit below a later line after deletes left gaps.
    lines.reorder()  # pyright: ignore[reportAttributeAccessIssue]  # an ordering_list at runtime
    db.commit()
    db.refresh(line)
    return line


def _reorder(db: Session, recipe: Recipe, attribute: str, ids: list[int]) -> list:
    """Puts the recipe's steps, requirements or recipe_ingredients in the order of ids."""
    by_id = {line.id: line for line in getattr(recipe, attribute)}
    # A list that no longer matches (a line added or removed since the client loaded) is refused, not merged.
    # shortcut: no lock, so a line added between this check and the commit is not refused; it keeps its
    # (last) position and is missing from the response. Lock or re-check in the transaction if that matters.
    if sorted(ids) != sorted(by_id):
        raise OrderMismatchError
    setattr(recipe, attribute, [by_id[line_id] for line_id in ids])
    getattr(recipe, attribute).reorder()  # an ordering_list at runtime
    db.commit()
    return list(getattr(recipe, attribute))


def create_step(db: Session, recipe: Recipe, step_in: StepCreate) -> Step:
    return _append(db, recipe.steps, Step(**step_in.model_dump()))


def get_step(db: Session, recipe_id: int, step_id: int) -> Step | None:
    return db.execute(select(Step).where(Step.recipe_id == recipe_id, Step.id == step_id)).scalar()


def reorder_steps(db: Session, recipe: Recipe, order_in: StepOrder) -> list[Step]:
    return _reorder(db, recipe, "steps", order_in.step_ids)


## Step

## Requirement


def create_requirement(db: Session, recipe: Recipe, requirement_in: RequirementCreate) -> Requirement:
    return _append(db, recipe.requirements, Requirement(**requirement_in.model_dump()))


def reorder_requirements(db: Session, recipe: Recipe, order_in: RequirementOrder) -> list[Requirement]:
    return _reorder(db, recipe, "requirements", order_in.requirement_ids)


def get_requirement(db: Session, recipe_id: int, requirement_id: int) -> Requirement | None:
    return db.execute(select(Requirement).where(Requirement.recipe_id == recipe_id, Requirement.id == requirement_id)).scalar()


## Requirement


## Recipe Ingredients


def create_recipe_ingredient(db: Session, recipe: Recipe, ri_in: RecipeIngredientCreate) -> RecipeIngredient:
    return _append(db, recipe.recipe_ingredients, _reduce(RecipeIngredient(**ri_in.model_dump())))


def reorder_recipe_ingredients(db: Session, recipe: Recipe, order_in: RecipeIngredientOrder) -> list[RecipeIngredient]:
    return _reorder(db, recipe, "recipe_ingredients", order_in.recipe_ingredient_ids)


def update_recipe_ingredient(db: Session, recipe_ingredient: RecipeIngredient, ri_in: RecipeIngredientUpdate) -> RecipeIngredient:
    for field, value in ri_in.model_dump(exclude_unset=True).items():
        setattr(recipe_ingredient, field, value)
    _reduce(recipe_ingredient)

    db.commit()
    db.refresh(recipe_ingredient)
    return recipe_ingredient


def get_recipe_ingredient(db: Session, recipe_id: int, recipe_ingredient_id: int) -> RecipeIngredient | None:
    return db.execute(
        select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id, RecipeIngredient.id == recipe_ingredient_id)
    ).scalar()


## Recipe Ingredients
