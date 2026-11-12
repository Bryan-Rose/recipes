import json
from pathlib import Path

import httpx2
import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models.ingredient import Ingredient
from app.services import fetch
from scripts.try_import import main
from tests.test_imports import DRAFT, RECIPE_PAGE, FakeApi, message

KEY = "sk-ant-secret-key"


@pytest.fixture()
def fake(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[FakeApi, httpx2.Client]:
    database = tmp_path / "app.db"
    engine = create_engine(f"sqlite:///{database}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(Ingredient(name="buttermilk"))
        db.commit()
    monkeypatch.chdir(tmp_path)  # away from backend/.env
    monkeypatch.setenv("RECIPES_DATABASE_URL", f"sqlite:///{database}")
    monkeypatch.setenv("RECIPES_ANTHROPIC_API_KEY", KEY)
    api = FakeApi()
    return api, httpx2.Client(transport=httpx2.MockTransport(api.handle))


def test_text_prints_draft_and_cost_never_the_key(fake, tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    api, http = fake
    (tmp_path / "recipe.txt").write_text("Pancakes\n1 1/2 cups flour")

    main(["--text", "recipe.txt"], http)

    out = capsys.readouterr().out
    assert json.loads(out[: out.rindex("}") + 1]) == DRAFT
    assert "claude-sonnet-5-5: 2000 input + 500 output tokens, cost $0.0090" in out
    assert KEY not in out
    prompt = api.requests[0]["messages"][0]["content"]
    assert "buttermilk" in prompt and "1 1/2 cups flour" in prompt


def test_photos_are_sent_in_order(fake, tmp_path: Path):
    api, http = fake
    (tmp_path / "1.jpg").write_bytes(b"\xff\xd8\xff page one")
    (tmp_path / "2.jpg").write_bytes(b"\xff\xd8\xff page two")

    main(["--photo", "1.jpg", "2.jpg"], http)

    images = [block["source"]["data"] for block in api.requests[0]["messages"][0]["content"] if block["type"] == "image"]
    assert images == ["/9j/IHBhZ2Ugb25l", "/9j/IHBhZ2UgdHdv"]


def test_reports_a_cut_off_reply(fake, tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    api, http = fake
    api.body = message("{", stop_reason="max_tokens")
    (tmp_path / "recipe.txt").write_text("Pancakes")

    main(["--text", "recipe.txt"], http)

    out = capsys.readouterr().out
    assert "Cut off" in out and "No draft." in out


def test_needs_a_key(fake, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RECIPES_ANTHROPIC_API_KEY", "")
    with pytest.raises(SystemExit, match="RECIPES_ANTHROPIC_API_KEY"):
        main(["--url", "https://example.com/"])


@pytest.fixture()
def site(monkeypatch: pytest.MonkeyPatch) -> httpx2.MockTransport:
    """example.com on a public address: RECIPE_PAGE at /, a blank page at /blank, 404 elsewhere."""
    pages = {"/": RECIPE_PAGE, "/blank": "<html></html>"}
    monkeypatch.setattr(fetch.socket, "getaddrinfo", lambda host, port, **_: [(2, 1, 6, "", ("93.184.215.14", port))])
    return httpx2.MockTransport(
        lambda request: httpx2.Response(200, html=pages[request.url.path]) if request.url.path in pages else httpx2.Response(404)
    )


def test_url_sends_the_pages_recipe(fake, site, capsys: pytest.CaptureFixture[str]):
    api, http = fake

    main(["--url", "https://example.com/"], http, site)

    assert '"name": "Web pancakes"' in api.requests[0]["messages"][0]["content"]
    assert "cost $0.0090" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("path", "error"), [("/gone", "Couldn't open that page: the site answered 404"), ("/blank", "No text on that page")]
)
def test_url_problems_exit_without_calling_claude(fake, site, path: str, error: str):
    api, http = fake
    with pytest.raises(SystemExit, match=error):
        main(["--url", f"https://example.com{path}"], http, site)
    assert api.requests == []


def test_photos_get_the_apps_checks(fake, tmp_path: Path):
    api, http = fake
    (tmp_path / "page.png").write_bytes(b"\x89PNG")
    with pytest.raises(ValidationError, match="must be a base64 JPEG"):
        main(["--photo", "page.png"], http)
    assert api.requests == []
