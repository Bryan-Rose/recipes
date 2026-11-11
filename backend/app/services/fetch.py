"""Downloads a recipe page for URL import and boils it down to text for Claude.

The backend fetches the page itself (Claude's web_fetch is refused by most big recipe
sites), so every hop is checked against SSRF: http(s) only, and the host must resolve to
public addresses only. The connection goes to the address that was checked, so a DNS
answer can't change between the check and the request.
"""

import ipaddress
import json
import socket
import time
from html.parser import HTMLParser
from typing import Any

import httpx2

MAX_BYTES = 2_000_000
MAX_REDIRECTS = 5
DEADLINE_SECONDS = 15
# Recipe blogs can run long; this keeps a parse near $0.03 at Sonnet 5.5 prices.
MAX_TEXT = 60_000
# Many recipe sites turn away clients that don't look like a browser.
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"


class FetchError(Exception):
    """Why the page couldn't be fetched, worded for the user."""


def _checked_address(host: str, port: int, allow_private: bool) -> str:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError) as exc:
        raise FetchError("that site's address doesn't resolve") from exc
    addresses = [str(info[4][0]).split("%")[0] for info in infos]
    if not addresses:
        raise FetchError("that site's address doesn't resolve")
    if not allow_private and not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise FetchError("that isn't a public web address")
    return addresses[0]


def fetch_page(url: str, transport: httpx2.BaseTransport | None = None, allow_private: bool = False) -> str:
    """The HTML at url, following up to MAX_REDIRECTS redirects, each checked the same way."""
    deadline = time.monotonic() + DEADLINE_SECONDS
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
    # A fresh client per fetch: pooled connections are keyed by address, not by host name.
    with httpx2.Client(transport=transport, timeout=5.0, follow_redirects=False, headers=headers) as client:
        for _ in range(MAX_REDIRECTS + 1):
            target = httpx2.URL(url)
            if target.scheme not in ("http", "https") or not target.host:
                raise FetchError("only http and https links work")
            address = _checked_address(target.host, target.port or (443 if target.scheme == "https" else 80), allow_private)
            try:
                with client.stream(
                    "GET",
                    target.copy_with(host=address),
                    headers={"Host": target.netloc.decode("ascii")},
                    extensions={"sni_hostname": target.host},
                ) as response:
                    if response.is_redirect:
                        url = str(target.join(response.headers["location"]))
                        continue
                    if response.status_code != 200:
                        raise FetchError(f"the site answered {response.status_code}")
                    if "html" not in response.headers.get("content-type", ""):
                        raise FetchError("that link isn't a web page")
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            raise FetchError("that page is too big")
                        if time.monotonic() > deadline:
                            raise FetchError("that site is too slow")
                    return body.decode(response.encoding or "utf-8", errors="replace")
            except httpx2.HTTPError as exc:
                raise FetchError("couldn't connect to that site") from exc
    raise FetchError("that link redirects too many times")


# Elements whose text a reader never sees.
_HIDDEN = frozenset({"script", "style", "noscript", "svg", "template"})


class _Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text: list[str] = []
        self.json_ld: list[str] = []
        self._skipping: list[str] = []
        self._in_json_ld = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and ("type", "application/ld+json") in attrs:
            self._in_json_ld = True
            self.json_ld.append("")
        elif tag in _HIDDEN:
            self._skipping.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
        elif self._skipping and self._skipping[-1] == tag:
            self._skipping.pop()

    def handle_data(self, data: str) -> None:
        if self._in_json_ld:
            self.json_ld[-1] += data
        elif not self._skipping and data.strip():
            self.text.append(data.strip())


def _find_recipe(node: Any) -> dict | None:
    if isinstance(node, list):
        return next((found for item in node if (found := _find_recipe(item))), None)
    if not isinstance(node, dict):
        return None
    kind = node.get("@type")
    if kind == "Recipe" or (isinstance(kind, list) and "Recipe" in kind):
        return node
    return _find_recipe(node.get("@graph"))


def page_text(html: str) -> str:
    """The page's schema.org Recipe as JSON when it has one (most recipe sites do), else its visible text."""
    page = _Page()
    page.feed(html)
    for block in page.json_ld:
        try:
            recipe = _find_recipe(json.loads(block))
        except ValueError:
            continue
        if recipe:
            # Reviews can be most of the block and say nothing about the recipe.
            recipe = {key: value for key, value in recipe.items() if key not in ("review", "aggregateRating", "video")}
            return json.dumps(recipe, ensure_ascii=False, indent=1)[:MAX_TEXT]
    return "\n".join(page.text)[:MAX_TEXT]
