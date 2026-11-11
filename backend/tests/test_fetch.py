import itertools
import json
import socket

import httpx2
import pytest

from app.services import fetch
from app.services.fetch import FetchError, fetch_page, page_text

PAGE = "<html><body><p>Pancakes</p></body></html>"


class FakeWeb:
    """DNS answers by host name, and HTTP responses by host name and path."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.dns: dict[str, list[str]] = {"example.com": ["93.184.215.14"]}
        self.pages: dict[str, httpx2.Response] = {"example.com/": httpx2.Response(200, html=PAGE)}
        self.requests: list[httpx2.Request] = []
        monkeypatch.setattr(fetch.socket, "getaddrinfo", self.resolve)

    def resolve(self, host: str, port: int, **_) -> list:
        if host not in self.dns:
            raise socket.gaierror("unknown")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in self.dns[host]]

    def handle(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        key = request.headers["host"] + request.url.path
        return self.pages.get(key) or httpx2.Response(404)

    def get(self, url: str, **kwargs) -> str:
        return fetch_page(url, httpx2.MockTransport(self.handle), **kwargs)


@pytest.fixture()
def web(monkeypatch: pytest.MonkeyPatch) -> FakeWeb:
    return FakeWeb(monkeypatch)


def test_connects_to_the_checked_address(web: FakeWeb):
    assert web.get("https://example.com/") == PAGE
    (request,) = web.requests
    assert request.url.host == "93.184.215.14"
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"


def test_connects_to_a_public_ipv6_address(web: FakeWeb):
    web.dns["example.com"] = ["2606:4700::6810:84e5"]
    assert web.get("https://example.com/") == PAGE
    assert web.requests[0].url.host == "2606:4700::6810:84e5"


@pytest.mark.parametrize("ips", [["127.0.0.1"], ["10.0.0.5"], ["169.254.169.254"], ["::1"], ["fd00::1"], ["93.184.215.14", "192.168.1.2"]])
def test_refuses_private_addresses(web: FakeWeb, ips: list[str]):
    web.dns["example.com"] = ips
    with pytest.raises(FetchError, match="isn't a public web address"):
        web.get("https://example.com/")
    assert web.requests == []


def test_private_addresses_allowed_when_configured(web: FakeWeb):
    web.dns["example.com"] = ["10.0.0.5"]
    assert web.get("https://example.com/", allow_private=True) == PAGE


def test_follows_redirects_and_checks_each_hop(web: FakeWeb):
    web.dns["short.link"] = ["93.184.215.15"]
    web.pages["short.link/r"] = httpx2.Response(302, headers={"location": "https://example.com/"})
    assert web.get("http://short.link/r") == PAGE

    web.dns["evil.link"] = ["93.184.215.16"]
    web.dns["internal"] = ["10.0.0.5"]
    web.pages["evil.link/r"] = httpx2.Response(302, headers={"location": "http://internal/admin"})
    with pytest.raises(FetchError, match="isn't a public web address"):
        web.get("http://evil.link/r")


def test_stops_after_too_many_redirects(web: FakeWeb):
    web.pages["example.com/loop"] = httpx2.Response(302, headers={"location": "/loop"})
    with pytest.raises(FetchError, match="redirects too many times"):
        web.get("https://example.com/loop")
    assert len(web.requests) == fetch.MAX_REDIRECTS + 1


@pytest.mark.parametrize(
    ("url", "response", "message"),
    [
        ("ftp://example.com/", None, "only http and https"),
        ("https://nowhere.invalid/", None, "doesn't resolve"),
        ("https://example.com/gone", None, "answered 404"),
        ("https://example.com/pdf", httpx2.Response(200, content=b"%PDF", headers={"content-type": "application/pdf"}), "isn't a web page"),
        ("https://example.com/big", httpx2.Response(200, html="x" * (fetch.MAX_BYTES + 1)), "too big"),
    ],
)
def test_explains_what_went_wrong(web: FakeWeb, url: str, response: httpx2.Response | None, message: str):
    if response is not None:
        web.pages["example.com" + httpx2.URL(url).path] = response
    with pytest.raises(FetchError, match=message):
        web.get(url)


def test_connection_failure_is_a_fetch_error(web: FakeWeb):
    def refuse(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("refused", request=request)

    with pytest.raises(FetchError, match="couldn't connect"):
        fetch_page("https://example.com/", httpx2.MockTransport(refuse))


def ld(data: object) -> str:
    return f'<script type="application/ld+json">{json.dumps(data)}</script>'


def test_prefers_the_schema_org_recipe():
    recipe = {"@type": ["Recipe", "NewsArticle"], "name": "Pancakes", "review": [{"reviewBody": "Yum"}], "recipeIngredient": ["2 eggs"]}
    html = "<html><head>" + ld({"@type": "WebSite"}) + "<script type='application/ld+json'>{broken</script>"
    html += ld({"@context": "https://schema.org", "@graph": [{"@type": "Person"}, recipe]}) + "</head><body><p>Story</p></body></html>"
    assert json.loads(page_text(html)) == {"@type": ["Recipe", "NewsArticle"], "name": "Pancakes", "recipeIngredient": ["2 eggs"]}


def test_falls_back_to_the_visible_text():
    html = (
        "<html><head><title>Soup</title><style>p{}</style></head><body><nav>Home</nav><script>track()</script><p>2 leeks</p></body></html>"
    )
    assert page_text(html) == "Soup\nHome\n2 leeks"


def test_deadline_covers_the_whole_redirect_chain(web: FakeWeb, monkeypatch: pytest.MonkeyPatch):
    clock = [0.0]
    monkeypatch.setattr(fetch.time, "monotonic", lambda: clock[0])
    handle = web.handle

    def slow(request: httpx2.Request) -> httpx2.Response:
        clock[0] += 6  # each hop takes 6 of the 15 seconds
        return handle(request)

    web.pages["example.com/loop"] = httpx2.Response(302, headers={"location": "/loop"})
    with pytest.raises(FetchError, match="too slow"):
        fetch_page("https://example.com/loop", httpx2.MockTransport(slow))
    assert len(web.requests) == 3
    # The last hop only had the 3 seconds left.
    assert web.requests[-1].extensions["timeout"]["read"] == pytest.approx(3)


def test_slow_body_hits_the_deadline(web: FakeWeb, monkeypatch: pytest.MonkeyPatch):
    # Start, the hop's check, the request's timeout; then the body arrives late.
    clock = itertools.chain([0.0, 1.0, 1.0], itertools.repeat(99.0))
    monkeypatch.setattr(fetch.time, "monotonic", lambda: next(clock))
    with pytest.raises(FetchError, match="too slow"):
        web.get("https://example.com/")


def test_malformed_host_name_does_not_resolve():
    # A 64-character label can't be IDNA-encoded, so this fails before any lookup.
    with pytest.raises(FetchError, match="doesn't resolve"):
        fetch._checked_address("a" * 64 + ".example", 443, allow_private=False)


def test_deeply_nested_json_ld_falls_back_to_the_text():
    html = '<script type="application/ld+json">' + "[" * 100_000 + "]" * 100_000 + "</script><p>2 leeks</p>"
    assert page_text(html) == "2 leeks"


def test_text_is_capped():
    assert len(page_text("<p>" + "x" * (fetch.MAX_TEXT + 10) + "</p>")) == fetch.MAX_TEXT


def test_json_ld_type_is_matched_loosely():
    html = '<script type="Application/LD+JSON; charset=utf-8">{"@type": "Recipe", "name": "Soup"}</script><p>Story</p>'
    assert json.loads(page_text(html)) == {"@type": "Recipe", "name": "Soup"}
