"""Image files on disk. Each upload gets a fresh random name, so a URL never changes content."""

import base64
import secrets
from pathlib import Path

from app.schemas.recipes import ImageUpload

# The files saved for one image, by suffix; GET /images/ serves only names matching these.
SUFFIXES = ("", "-thumb")


def save(directory: Path, upload: ImageUpload) -> str:
    """Writes both files and returns the name to store in the database."""
    directory.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(16)
    for suffix, data in zip(SUFFIXES, (upload.full, upload.thumb), strict=True):
        (directory / f"{name}{suffix}.jpg").write_bytes(base64.b64decode(data))
    return name


def delete(directory: Path, name: str | None) -> None:
    if name:
        for suffix in SUFFIXES:
            (directory / f"{name}{suffix}.jpg").unlink(missing_ok=True)
