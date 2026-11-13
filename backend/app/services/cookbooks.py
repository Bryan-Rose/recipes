from collections.abc import Sequence
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cookbook import Cookbook
from app.models.recipe import Recipe
from app.schemas.cookbook import CookbookCreate, CookbookUpdate
from app.schemas.recipes import ImageUpload
from app.services import images


def get_cookbook(db: Session, cookbook_id: int) -> Cookbook | None:
    return db.get(Cookbook, cookbook_id)


def get_cookbooks(db: Session) -> Sequence[Cookbook]:
    return db.execute(select(Cookbook).order_by(Cookbook.name, Cookbook.id)).scalars().all()


def create_cookbook(db: Session, cookbook_in: CookbookCreate) -> Cookbook:
    db_model = Cookbook(**cookbook_in.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_cookbook(db: Session, cookbook: Cookbook, cookbook_in: CookbookUpdate) -> Cookbook:
    for field, value in cookbook_in.model_dump(exclude_unset=True).items():
        setattr(cookbook, field, value)
    db.commit()
    db.refresh(cookbook)
    return cookbook


def unlink_clashes(db: Session, cookbook: Cookbook) -> Sequence[str]:
    """Names of this cookbook's recipes that a recipe without a cookbook already uses, sorted."""
    loose = select(Recipe.name).where(Recipe.cookbook_id.is_(None))
    # The NOCASE column collation applies to IN, matching the unique index.
    clashes = select(Recipe.name).where(Recipe.cookbook_id == cookbook.id, Recipe.name.in_(loose)).order_by(Recipe.name)
    return db.scalars(clashes).all()


def delete_cookbook(db: Session, cookbook: Cookbook, images_dir: Path) -> None:
    image = cookbook.image
    # The recipes are unlinked, and a page means nothing without its cookbook.
    for recipe in cookbook.recipes:
        recipe.cookbook_page = None
    db.delete(cookbook)
    db.commit()
    images.delete(images_dir, image)


def set_image(db: Session, cookbook: Cookbook, images_dir: Path, upload: ImageUpload | None) -> Cookbook:
    images.replace(db, cookbook, images_dir, upload)
    return cookbook
