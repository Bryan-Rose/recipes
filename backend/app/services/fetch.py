"""Downloads a recipe page (and its picture) for URL import and boils the page down to text for Claude.

The backend fetches the page itself (Claude's web_fetch is refused by most big recipe
sites), so every hop is checked against SSRF: http(s) only, and the host must resolve to
public addresses only. The connection goes to the address that was checked, so a DNS
answer can't change between the check and the request.
"""

import ipaddress
import json
import socket
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from typing import Any

import httpx2

MAX_BYTES = 2_000_000
MAX_IMAGE_BYTES = 5_000_000
MAX_REDIRECTS = 5
DEADLINE_SECONDS = 15
# Each socket read gets this long, fixed when the request opens, so a read that starts just
# before a deadline can end up to this far past it (budget in routers/imports.py).
READ_TIMEOUT_SECONDS = 5.0
# The picture is optional, so it gets less of the time nginx allows the whole import
# (budget in routers/imports.py).
IMAGE_DEADLINE_SECONDS = 8
# Recipe blogs can run long; this keeps a parse near $0.03 at Sonnet 5.5 prices.
MAX_TEXT = 60_000
# Many recipe sites turn away clients that don't look like a browser.
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"


class FetchError(Exception):
    """Why the page couldn't be fetched, worded for the user."""


def _checked_address(host: str, port: int, allow_private: bool, seconds: float) -> str:
    # The system resolver takes no timeout, so wait on it in a thread; one that hangs is
    # left to finish when the resolver gives up.
    pool = ThreadPoolExecutor(max_workers=1)
    lookup = pool.submit(socket.getaddrinfo, host, port, type=socket.SOCK_STREAM)
    pool.shutdown(wait=False)
    try:
        infos = lookup.result(timeout=seconds)
    except TimeoutError as exc:
        raise FetchError("that site is too slow") from exc
    except (socket.gaierror, UnicodeError) as exc:
        raise FetchError("that site's address doesn't resolve") from exc
    addresses = [str(info[4][0]).split("%")[0] for info in infos]
    if not allow_private and not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise FetchError("that isn't a public web address")
    return addresses[0]


def fetch_page(url: str, transport: httpx2.BaseTransport | None = None, allow_private: bool = False) -> tuple[str, str]:
    """The HTML at url and the address it ended up at, following up to MAX_REDIRECTS redirects, each checked the same way."""
    body, encoding, final_url = _get(
        url,
        transport,
        allow_private,
        "text/html,application/xhtml+xml",
        lambda kind: "html" in kind,
        "web page",
        MAX_BYTES,
        DEADLINE_SECONDS,
    )
    return body.decode(encoding or "utf-8", errors="replace"), final_url


def fetch_image(url: str, transport: httpx2.BaseTransport | None = None, allow_private: bool = False) -> bytes:
    """The image at url, checked like a page. SVG is refused: it's a document, not a photo."""
    body, _, _ = _get(
        url,
        transport,
        allow_private,
        "image/avif,image/webp,image/png,image/jpeg,image/*",
        lambda kind: kind.startswith("image/") and "svg" not in kind,
        "image",
        MAX_IMAGE_BYTES,
        IMAGE_DEADLINE_SECONDS,
    )
    return bytes(body)


def _get(
    url: str,
    transport: httpx2.BaseTransport | None,
    allow_private: bool,
    accept: str,
    wanted: Callable[[str], bool],
    what: str,
    max_bytes: int,
    seconds: float,
) -> tuple[bytearray, str | None, str]:
    """The body, its encoding and the final URL, if the content type passes `wanted`."""
    deadline = time.monotonic() + seconds

    def time_left() -> float:
        left = deadline - time.monotonic()
        if left <= 0:
            raise FetchError("that site is too slow")
        return left

    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    # A fresh client per fetch: pooled connections are keyed by address, not by host name.
    with httpx2.Client(transport=transport, timeout=READ_TIMEOUT_SECONDS, follow_redirects=False, headers=headers) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                target = httpx2.URL(url)
            except httpx2.InvalidURL as exc:
                raise FetchError("that link isn't a valid address") from exc
            if target.scheme not in ("http", "https") or not target.host:
                raise FetchError("only http and https links work")
            port = target.port or (443 if target.scheme == "https" else 80)
            address = _checked_address(target.host, port, allow_private, time_left())
            try:
                with client.stream(
                    "GET",
                    target.copy_with(host=address),
                    headers={"Host": target.netloc.decode("ascii")},
                    extensions={"sni_hostname": target.host},
                    timeout=min(READ_TIMEOUT_SECONDS, time_left()),
                ) as response:
                    if response.is_redirect:
                        url = str(target.join(response.headers["location"]))
                        continue
                    if response.status_code != 200:
                        raise FetchError(f"the site answered {response.status_code}")
                    if not wanted(response.headers.get("content-type", "").lower()):
                        raise FetchError(f"that link isn't a {what}")
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > max_bytes:
                            raise FetchError(f"that {what} is too big")
                        time_left()
                    return body, response.encoding, str(target)
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
        self.og_image: str | None = None
        self._skipping: list[str] = []
        self._in_json_ld = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        kind = (attributes.get("type") or "").split(";")[0].strip().lower()
        if tag == "meta" and attributes.get("property") == "og:image" and self.og_image is None:
            self.og_image = attributes.get("content")
        elif tag == "script" and kind == "application/ld+json":
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


def _recipe(page: _Page) -> dict | None:
    for block in page.json_ld:
        try:
            recipe = _find_recipe(json.loads(block))
        except ValueError, RecursionError:
            continue
        if recipe:
            return recipe
    return None


def page_text(html: str) -> str:
    """The page's schema.org Recipe as JSON when it has one (most recipe sites do), else its visible text."""
    page = _Page()
    page.feed(html)
    if recipe := _recipe(page):
        # Reviews can be most of the block and say nothing about the recipe.
        recipe = {key: value for key, value in recipe.items() if key not in ("review", "aggregateRating", "video")}
        return json.dumps(recipe, ensure_ascii=False, indent=1)[:MAX_TEXT]
    return "\n".join(page.text)[:MAX_TEXT]


def _image_url(node: Any) -> str | None:
    """schema.org's image is a URL, an ImageObject or a list of either; the first one."""
    if isinstance(node, list):
        return _image_url(node[0]) if node else None
    if isinstance(node, dict):
        return _image_url(node.get("url") or node.get("contentUrl"))
    return node if isinstance(node, str) and node.strip() else None


def page_image(html: str, page_url: str) -> str | None:
    """The address of the page's picture: its schema.org Recipe's image, else its og:image."""
    page = _Page()
    page.feed(html)
    recipe = _recipe(page)
    found = (_image_url(recipe.get("image")) if recipe else None) or page.og_image
    if not found:
        return None
    try:
        return str(httpx2.URL(page_url).join(found.strip()))
    except httpx2.InvalidURL:
        return None
