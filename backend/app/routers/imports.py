import logging
from functools import lru_cache

import anthropic
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.imports import RecipeImport, TextImport
from app.services import imports as imports_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["imports"])


@lru_cache
def _client(api_key: str, base_url: str | None) -> anthropic.Anthropic:
    # One attempt under nginx's 120s read timeout: the reply isn't streamed, so a retry
    # after a timeout would start (and bill) the whole parse again. The user can retry.
    return anthropic.Anthropic(api_key=api_key, base_url=base_url, timeout=110.0, max_retries=0)


def get_import_client(settings: Settings = Depends(get_settings)) -> anthropic.Anthropic:
    if not settings.import_enabled or settings.anthropic_api_key is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Recipe import isn't set up")
    return _client(settings.anthropic_api_key.get_secret_value().strip(), settings.anthropic_base_url)


@router.post("/text", response_model=RecipeImport)
def import_text(
    body: TextImport,
    user: User = Depends(get_current_user),
    client: anthropic.Anthropic = Depends(get_import_client),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    too_long = False
    try:
        draft, usage = imports_service.parse_text(client, settings.import_model, db, body.text)
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
    if too_long:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="That's too long to read in one go; try a shorter excerpt"
        )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Couldn't read a recipe from that")
    return RecipeImport(**draft.model_dump(), usage=usage)
