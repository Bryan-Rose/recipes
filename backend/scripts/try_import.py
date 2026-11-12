"""Run one recipe import against the real Claude API, for prompt tuning. It costs money.

Run from the backend/ directory; it uses backend/.env and opens the database read-only:

    uv run python -m scripts.try_import --text recipe.txt
    uv run python -m scripts.try_import --photo page1.jpg page2.jpg   # JPEGs, under 5 MB each
    uv run python -m scripts.try_import --url https://example.com/pancakes

Prints the draft as JSON, then the model, tokens, cost and time taken.
"""

import argparse
import base64
import json
import sqlite3
import time
from pathlib import Path

import anthropic
import httpx2
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.config import Settings
from app.services import fetch, imports


def main(argv: list[str] | None = None, http_client: httpx2.Client | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", type=Path, metavar="FILE")
    source.add_argument("--photo", type=Path, nargs="+", metavar="FILE")
    source.add_argument("--url")
    args = parser.parse_args(argv)

    settings = Settings()
    if not settings.import_enabled or settings.anthropic_api_key is None:
        raise SystemExit("set RECIPES_ANTHROPIC_API_KEY in backend/.env first")
    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key.get_secret_value().strip(),
        base_url=settings.anthropic_base_url,
        http_client=http_client,
        max_retries=0,  # a retry would bill the whole parse again
    )
    path = make_url(settings.database_url).database
    engine = create_engine("sqlite://", creator=lambda: sqlite3.connect(f"file:{path}?mode=ro", uri=True))

    started = time.monotonic()
    with Session(engine) as db:
        try:
            if args.text:
                draft, usage = imports.parse_text(client, settings.import_model, db, args.text.read_text())
            elif args.photo:
                photos = [base64.b64encode(photo.read_bytes()).decode() for photo in args.photo]
                draft, usage = imports.parse_photos(client, settings.import_model, db, photos)
            else:
                page = fetch.page_text(fetch.fetch_page(args.url, allow_private=settings.import_fetch_private))
                draft, usage = imports.parse_text(client, settings.import_model, db, page)
        except imports.ReplyCutOff as exc:
            draft, usage = None, exc.usage
            print("Cut off: the reply ran out of output tokens.")
        except fetch.FetchError as exc:
            raise SystemExit(f"Couldn't open that page: {exc}") from exc
    seconds = time.monotonic() - started

    print(json.dumps(draft.model_dump(), indent=2, ensure_ascii=False) if draft else "No draft.")
    cost = "unknown" if usage.cost_usd is None else f"${usage.cost_usd:.4f}"
    print(f"{usage.model}: {usage.input_tokens} input + {usage.output_tokens} output tokens, cost {cost}, {seconds:.1f}s")


if __name__ == "__main__":
    main()
