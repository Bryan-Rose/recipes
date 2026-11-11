import base64
import json
import logging

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app as fastapi_app
from app.routers.imports import get_import_client

DRAFT = {
    "name": "Pancakes",
    "servings": 4,
    "active_cook_time": 20,
    "inactive_cook_time": None,
    "notes": "Range 1-2 cups milk: used 2.",
    "ingredients": [
        {"amount_numerator": 3, "amount_denominator": 2, "measurement": "cup", "ingredient": "flour", "preparation": "sifted"},
    ],
    "requirements": ["Frying pan"],
    "steps": ["Mix.", "Fry."],
}


JPEG = base64.b64encode(b"\xff\xd8\xff\xe0 page one").decode()
JPEG_2 = base64.b64encode(b"\xff\xd8\xff\xe0 page two").decode()


def message(text: str, stop_reason: str = "end_turn", model: str = "claude-sonnet-5-5", **usage) -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 2000, "output_tokens": 500, **usage},
    }


class FakeApi:
    """The real SDK over a mock transport, so request building and response parsing are exercised."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.status = 200
        self.body: dict = message(json.dumps(DRAFT))

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(json.loads(request.content))
        return httpx2.Response(self.status, json=self.body)


@pytest.fixture()
def fake_api(client: TestClient):
    fake = FakeApi()
    sdk = anthropic.Anthropic(api_key="test", max_retries=0, http_client=httpx2.Client(transport=httpx2.MockTransport(fake.handle)))
    fastapi_app.dependency_overrides[get_import_client] = lambda: sdk
    return fake


def test_returns_the_parsed_draft(client: TestClient, fake_api: FakeApi):
    response = client.post("/imports/text", json={"text": "Pancakes\n1 1/2 cups flour"})
    assert response.status_code == 200
    # Sonnet 5.5: 2000 x $2/M + 500 x $10/M.
    usage = {"model": "claude-sonnet-5-5", "input_tokens": 2000, "output_tokens": 500, "cost_usd": pytest.approx(0.009)}
    assert response.json() == {**DRAFT, "usage": usage}


def test_prompt_lists_existing_lookups_and_the_text(client: TestClient, fake_api: FakeApi, ingredient, measurement, preparation):
    client.post("/imports/text", json={"text": "Pancakes\n1 1/2 cups flour"})
    (sent,) = fake_api.requests
    assert sent["model"] == "claude-sonnet-5-5"
    assert sent["fallbacks"] == "default"
    prompt = sent["messages"][0]["content"]
    for name in (ingredient.name, measurement.name, preparation.name, "1 1/2 cups flour"):
        assert name in prompt


def test_model_comes_from_settings(client: TestClient, fake_api: FakeApi):
    fastapi_app.dependency_overrides[get_settings] = lambda: Settings(import_model="claude-haiku-5-5")
    client.post("/imports/text", json={"text": "Pancakes"})
    assert fake_api.requests[0]["model"] == "claude-haiku-5-5"


@pytest.mark.parametrize(
    ("text", "stop_reason"),
    [
        ("", "refusal"),
        (json.dumps(DRAFT), "refusal"),
        # Finished normally, but the reply isn't JSON or doesn't fit the schema.
        ("Here is the recipe:", "end_turn"),
        (json.dumps({k: v for k, v in DRAFT.items() if k != "name"}), "end_turn"),
    ],
)
def test_unfinished_parse_is_422(client: TestClient, fake_api: FakeApi, text: str, stop_reason: str):
    fake_api.body = message(text, stop_reason)
    response = client.post("/imports/text", json={"text": "Pancakes"})
    assert response.status_code == 422
    assert response.json() == {"detail": "Couldn't read a recipe from that"}


def test_cut_off_reply_says_too_long(client: TestClient, fake_api: FakeApi, caplog: pytest.LogCaptureFixture):
    fake_api.body = message('{"name": "Pan', "max_tokens")
    with caplog.at_level(logging.INFO, logger="app"):
        response = client.post("/imports/text", json={"text": "Pancakes"})
    assert response.status_code == 422
    assert response.json() == {"detail": "That's too long to read in one go; try sending less of it"}
    assert "cut off" in caplog.text


def test_api_error_is_502_without_its_message(client: TestClient, fake_api: FakeApi):
    fake_api.status = 401
    fake_api.body = {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}
    response = client.post("/imports/text", json={"text": "Pancakes"})
    assert response.status_code == 502
    assert "api-key" not in response.text


@pytest.mark.parametrize("key", [None, "", "  "])
def test_without_a_key_is_503(client: TestClient, key: str | None):
    settings = Settings(anthropic_api_key=key)  # pyright: ignore[reportArgumentType]
    fastapi_app.dependency_overrides[get_settings] = lambda: settings
    assert settings.import_enabled is False
    assert client.post("/imports/text", json={"text": "Pancakes"}).status_code == 503


def test_key_makes_a_client(client: TestClient):
    settings = Settings(anthropic_api_key="sk-test", anthropic_base_url="http://mock:9000")  # pyright: ignore[reportArgumentType]
    sdk = get_import_client(settings)
    assert sdk.api_key == "sk-test"
    assert str(sdk.base_url).startswith("http://mock:9000")
    assert sdk.max_retries == 0
    assert get_import_client(settings) is sdk  # reused, not rebuilt per request


def test_text_may_be_exactly_the_limit(client: TestClient, fake_api: FakeApi):
    assert client.post("/imports/text", json={"text": "x" * 20_000}).status_code == 200


@pytest.mark.parametrize("text", ["", "   ", "x" * 20_001])
def test_text_must_be_present_and_bounded(client: TestClient, fake_api: FakeApi, text: str):
    assert client.post("/imports/text", json={"text": text}).status_code == 422
    assert fake_api.requests == []


@pytest.mark.parametrize(("path", "body"), [("/imports/text", {"text": "Pancakes"}), ("/imports/photos", {"photos": [JPEG]})])
def test_requires_login(client: TestClient, path: str, body: dict):
    client.cookies.clear()
    assert client.post(path, json=body).status_code == 401


def test_auth_config_says_whether_import_is_on(client: TestClient):
    fastapi_app.dependency_overrides[get_settings] = lambda: Settings(anthropic_api_key=None)
    assert client.get("/auth/config").json()["recipe_import"] is False
    fastapi_app.dependency_overrides[get_settings] = lambda: Settings(anthropic_api_key="k")  # pyright: ignore[reportArgumentType]
    assert client.get("/auth/config").json()["recipe_import"] is True


def test_asks_for_the_draft_schema(client: TestClient, fake_api: FakeApi):
    client.post("/imports/text", json={"text": "Pancakes"})
    config = fake_api.requests[0]["output_config"]
    assert config["effort"] == "medium"
    assert config["format"]["type"] == "json_schema"
    assert set(config["format"]["schema"]["required"]) >= {"name", "ingredients", "steps"}


def test_cost_is_logged_even_without_a_draft(client: TestClient, fake_api: FakeApi, caplog: pytest.LogCaptureFixture):
    fake_api.body = message("", "refusal")
    with caplog.at_level(logging.INFO, logger="app"):
        client.post("/imports/text", json={"text": "Pancakes"})
    assert "Recipe import by admin: claude-sonnet-5-5, 2000 input + 500 output tokens, cost $0.0090, no draft" in caplog.text


def test_fallback_runs_are_priced_per_model(client: TestClient, fake_api: FakeApi):
    iterations = [
        {"type": "message", "model": None, "input_tokens": 1000, "output_tokens": 100},
        {"type": "fallback_message", "model": "claude-opus-5-5", "input_tokens": 1000, "output_tokens": 400},
    ]
    # Top-level counts that differ from the runs' sums, to pin which source is reported.
    fake_api.body = message(json.dumps(DRAFT), model="claude-opus-5-5", iterations=iterations, input_tokens=7, output_tokens=7)
    usage = client.post("/imports/text", json={"text": "Pancakes"}).json()["usage"]
    # (1000 x 2 + 100 x 10) + (1000 x 4 + 400 x 20), per million.
    assert usage == {"model": "claude-opus-5-5", "input_tokens": 2000, "output_tokens": 500, "cost_usd": pytest.approx(0.015)}


def test_unpriced_model_has_no_cost(client: TestClient, fake_api: FakeApi, caplog: pytest.LogCaptureFixture):
    fake_api.body = message(json.dumps(DRAFT), model="claude-future-9")
    with caplog.at_level(logging.INFO, logger="app"):
        usage = client.post("/imports/text", json={"text": "Pancakes"}).json()["usage"]
    assert usage["cost_usd"] is None
    assert "cost unknown" in caplog.text


def test_photos_go_in_order_before_the_lookups(client: TestClient, fake_api: FakeApi, ingredient):
    response = client.post("/imports/photos", json={"photos": [JPEG, JPEG_2]})
    assert response.status_code == 200
    assert response.json()["name"] == "Pancakes"
    (sent,) = fake_api.requests
    *images, request = sent["messages"][0]["content"]
    assert images == [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": p}} for p in (JPEG, JPEG_2)]
    assert request["type"] == "text"
    assert ingredient.name in request["text"]


def test_photos_share_the_error_handling(client: TestClient, fake_api: FakeApi):
    fake_api.body = message("", "refusal")
    response = client.post("/imports/photos", json={"photos": [JPEG]})
    assert response.json() == {"detail": "Couldn't read a recipe from that"}


@pytest.mark.parametrize(
    "photos",
    [
        [],
        [JPEG] * 5,
        ["not base64!"],
        ["/9j/é"],  # non-ASCII
        [base64.b64encode(b"\x89PNG\r\n\x1a\n").decode()],  # base64, but not a JPEG
        ["/9j/" + "A" * 5_000_000],  # a JPEG header, but over the size limit
    ],
)
def test_photos_must_be_one_to_four_jpegs(client: TestClient, fake_api: FakeApi, photos: list[str]):
    assert client.post("/imports/photos", json={"photos": photos}).status_code == 422
    assert fake_api.requests == []


def test_four_photos_are_allowed(client: TestClient, fake_api: FakeApi):
    assert client.post("/imports/photos", json={"photos": [JPEG] * 4}).status_code == 200


@pytest.mark.parametrize("photo", ["not base64!", "/9j/é"])
def test_bad_photo_says_what_is_expected(client: TestClient, fake_api: FakeApi, photo: str):
    (error,) = client.post("/imports/photos", json={"photos": [photo]}).json()["detail"]
    assert "must be a base64 JPEG" in error["msg"]
