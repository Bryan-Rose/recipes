"""Image files on disk. Each upload gets a fresh random name, so a URL never changes content."""

import base64
import secrets
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.cookbook import Cookbook
from app.models.recipe import Recipe
from app.schemas.recipes import ImageUpload

# The files saved for one image, by suffix; GET /images/ serves only names matching these.
SUFFIXES = ("", "-thumb")


def save(directory: Path, upload: ImageUpload) -> str:
    """Writes both files and returns the name to store in the database."""
    directory.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(16)
    try:
        for suffix, data in zip(SUFFIXES, (upload.full, upload.thumb), strict=True):
            (directory / f"{name}{suffix}.jpg").write_bytes(base64.b64decode(data))
    except Exception:
        delete(directory, name)  # e.g. disk full on the thumbnail: no row will name the full file
        raise
    return name


def delete(directory: Path, name: str | None) -> None:
    if name:
        for suffix in SUFFIXES:
            (directory / f"{name}{suffix}.jpg").unlink(missing_ok=True)


def commit(db: Session, directory: Path, new_image: str | None) -> None:
    """Commits, deleting the image files just written if the row that names them wasn't saved."""
    try:
        db.commit()
    except Exception:
        delete(directory, new_image)
        raise


def replace(db: Session, row: Recipe | Cookbook, directory: Path, upload: ImageUpload | None) -> None:
    """Replaces or (with None) removes the row's image; the old files go once the change is saved."""
    old = row.image
    row.image = save(directory, upload) if upload else None
    commit(db, directory, row.image)
    delete(directory, old)
    db.refresh(row)
