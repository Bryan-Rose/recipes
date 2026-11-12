from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import FileResponse

from app.config import Settings, get_settings

router = APIRouter(prefix="/images", tags=["images"])

# Only names services/images.py generates, so a request can't reach any other file.
ImageName = Annotated[str, Path(pattern=r"^[0-9a-f]{32}(-thumb)?\.jpg$")]


@router.get("/{name}", response_class=FileResponse, responses={200: {"content": {"image/jpeg": {}}}})
def get_image(name: ImageName, settings: Settings = Depends(get_settings)):
    path = settings.images_dir / name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    # A name is never reused for different content. Private: images need a login.
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=31536000, immutable"})
