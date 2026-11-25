import base64
import logging
from collections.abc import Callable
from functools import lru_cache
from typing import Annotated

import anthropic
import httpx2
from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.database import get_db
from app.models import RecipeImportRecord
from app.models.user import User
from app.schemas.fields import IdPath
from app.schemas.imports import (
    ImportDetail,
    ImportRead,
    ImportSource,
    ImportUsage,
    PhotoImport,
    RecipeDraft,
    RecipeImport,
    TextImport,
    UrlImport,
)
from app.services import fetch
from app.services import imports as imports_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["imports"])

# A URL import fetches the page, parses it, then fetches its picture, all under nginx's
# 120s proxy_read_timeout. Each fetch can overrun its deadline by one socket read, so
# (15 + 5) + 85 + (8 + 5) leaves 2s spare (tests/test_imports.py checks it).
CLAUDE_TIMEOUT_SECONDS = 85.0


@lru_cache
def _client(api_key: str, base_url: str | None) -> anthropic.Anthropic:
    # One attempt under nginx's 120s read timeout: the reply isn't streamed, so a retry
    # after a timeout would start (and bill) the whole parse again. The user can retry.
    return anthropic.Anthropic(api_key=api_key, base_url=base_url, timeout=CLAUDE_TIMEOUT_SECONDS, max_retries=0)


def get_import_client(settings: Settings = Depends(get_settings)) -> anthropic.Anthropic:
    if not settings.import_enabled or settings.anthropic_api_key is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Recipe import isn't set up")
    return _client(settings.anthropic_api_key.get_secret_value().strip(), settings.anthropic_base_url)


def _run(
    user: User,
    db: Session,
    settings: Settings,
    source: ImportSource,
    original: list[bytes],
    parse: Callable[[], tuple[RecipeDraft | None, ImportUsage]],
    page_url: str | None = None,
) -> RecipeImport:
    too_long = False
    try:
        draft, usage = parse()
    except imports_service.ReplyCutOff as exc:
        draft, usage, too_long = None, exc.usage, True
    except anthropic.APIError as exc:
        # The SDK's message can name the account or key state, so log it rather than return it.
        log.warning("Recipe import failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The recipe reader isn't responding; try again") from exc
    cost = "unknown" if usage.cost_usd is None else f"${usage.cost_usd:.4f}"
    log.info(
        "Recipe import by %s: %s, %d input + %d output tokens, cost %s, %s",
        user.username,
        usage.model,
        usage.input_tokens,
        usage.output_tokens,
        cost,
        "draft returned" if draft else "cut off" if too_long else "no draft",
    )
    outcome = "draft" if draft else "cut_off" if too_long else "no_draft"
    row = imports_service.record(db, settings.imports_dir, user, source, usage, outcome, original, page_url)
    if too_long:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="That's too long to read in one go; try sending less of it"
        )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Couldn't read a recipe from that")
    return RecipeImport(**draft.model_dump(), usage=usage, import_id=row.id)


@router.get("/", response_model=list[ImportRead])
def list_imports(db: Session = Depends(get_db)):
    """Every import and what it cost, newest first. Works with import switched off, so past costs stay visible."""
    return imports_service.get_history(db)


@router.get("/{import_id}", response_model=ImportDetail)
def get_import(import_id: IdPath, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    row = _get_or_404(db, import_id)
    text = None
    if row.source == "text" and row.original_parts:
        path = imports_service.original_path(settings.imports_dir, row, 0)
        # Written as UTF-8 by record(); a file gone missing (a partial restore) shows as no text, not a 500.
        text = path.read_text(encoding="utf-8") if path.is_file() else None
    return ImportDetail.model_validate({**ImportRead.model_validate(row).model_dump(), "text": text})


# Page HTML goes out as plain text, so a stored page is read, never run, on this origin.
ORIGINAL_MEDIA_TYPE = {"text": "text/plain; charset=utf-8", "photos": "image/jpeg", "url": "text/plain; charset=utf-8"}


@router.get(
    "/{import_id}/original/{part}",
    response_class=FileResponse,
    responses={200: {"content": {"text/plain": {}, "image/jpeg": {}}}},
)
def get_original(
    import_id: IdPath, part: Annotated[int, Path(ge=0, le=100)], db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
):
    """One file of what an import sent to Claude: the pasted text, a photo (part = page, from 0) or the page HTML."""
    row = _get_or_404(db, import_id)
    path = imports_service.original_path(settings.imports_dir, row, part)
    if part >= row.original_parts or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return FileResponse(
        path,
        media_type=ORIGINAL_MEDIA_TYPE[row.source],
        headers={"Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )


def _get_or_404(db: Session, import_id: int) -> RecipeImportRecord:
    if (row := imports_service.get_import(db, import_id)) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import not found")
    return row


@router.post("/text", response_model=RecipeImport)
def import_text(
    body: TextImport,
    user: User = Depends(get_current_user),
    client: anthropic.Anthropic = Depends(get_import_client),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    original = [body.text.encode()]
    return _run(user, db, settings, "text", original, lambda: imports_service.parse_text(client, settings.import_model, db, body.text))


@router.post("/photos", response_model=RecipeImport)
def import_photos(
    body: PhotoImport,
    user: User = Depends(get_current_user),
    client: anthropic.Anthropic = Depends(get_import_client),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    original = [base64.b64decode(photo) for photo in body.photos]
    return _run(
        user, db, settings, "photos", original, lambda: imports_service.parse_photos(client, settings.import_model, db, body.photos)
    )


def get_fetch_transport() -> httpx2.BaseTransport | None:  # pragma: no cover — tests always swap in a mock
    """None is the real network; tests swap in a mock."""
    return None


@router.post("/url", response_model=RecipeImport)
def import_url(
    body: UrlImport,
    user: User = Depends(get_current_user),
    client: anthropic.Anthropic = Depends(get_import_client),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    transport: httpx2.BaseTransport | None = Depends(get_fetch_transport),
):
    try:
        html, page_url = fetch.fetch_page(str(body.url), transport, allow_private=settings.import_fetch_private)
    except fetch.FetchError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Couldn't open that page: {exc}. Try pasting the recipe text."
        ) from exc
    text = fetch.page_text(html)
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Couldn't read a recipe from that")
    # The page as decoded (UTF-8 from here on), before the recipe was picked out of it.
    original = [html.encode()]
    result = _run(
        user, db, settings, "url", original, lambda: imports_service.parse_text(client, settings.import_model, db, text), page_url
    )
    # Only after a draft: no picture is worth fetching for a failed parse.
    if image_url := fetch.page_image(html, page_url):
        try:
            result.image = base64.b64encode(fetch.fetch_image(image_url, transport, allow_private=settings.import_fetch_private)).decode()
        except fetch.FetchError as exc:
            # The recipe is what matters; the user can add a photo themselves.
            log.info("Recipe import left out the page's image %s: %s", image_url, exc)
    return result
