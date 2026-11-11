import logging

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.schemas.imports import RecipeDraft, TextImport
from app.services import imports as imports_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["imports"])


def get_import_client(settings: Settings = Depends(get_settings)) -> anthropic.Anthropic:
    if settings.anthropic_api_key is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Recipe import isn't set up")
    # Under the proxies' 120s read timeout, retry included.
    return anthropic.Anthropic(
        api_key=settings.anthropic_api_key.get_secret_value(),
        base_url=settings.anthropic_base_url,
        timeout=55.0,
        max_retries=1,
    )


@router.post("/text", response_model=RecipeDraft)
def import_text(
    body: TextImport,
    client: anthropic.Anthropic = Depends(get_import_client),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    try:
        draft = imports_service.parse_text(client, settings.import_model, db, body.text)
    except anthropic.APIError as exc:
        # The SDK's message can name the account or key state, so log it rather than return it.
        log.warning("Recipe import failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The recipe reader isn't responding; try again") from exc
    if draft is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Couldn't read a recipe from that")
    return draft
