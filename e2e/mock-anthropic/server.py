"""A stand-in for the Claude Messages API, for e2e only.

It "parses" the pasted recipe by line: name, measurement, ingredient, then one
step per remaining line. So a test controls every name and can keep them unique.
Photos can't be read that way, so they give a fixed recipe with one step per photo.

It also serves a recipe web page for URL import: GET /page?text=... returns the
text, one paragraph per line, with no schema.org data, so the backend sends
Claude the page's text and the line parsing above applies. Its og:image is
GET /picture.png, a tiny PNG.
"""

import base64
import html
import json
import re
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# A 2×1 PNG, the same as e2e/tests/helpers.ts.
PICTURE = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/picture.png":
            data, kind = PICTURE, "image/png"
        else:
            lines = parse_qs(url.query)["text"][0].splitlines()
            body = "".join(f"<p>{html.escape(line)}</p>" for line in lines)
            head = '<meta property="og:image" content="/picture.png">'
            data, kind = f"<!doctype html><html><head>{head}</head><body>{body}</body></html>".encode(), "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt = body["messages"][0]["content"]
        if isinstance(prompt, list):
            pages = sum(block["type"] == "image" for block in prompt)
            name, measurement, ingredient = "Photographed Stew", "whole", "onion"
            steps = [f"Step from photo {n}." for n in range(1, pages + 1)]
        else:
            lines = re.search(r"<recipe>\n(.*)\n</recipe>", prompt, re.S).group(1).splitlines()
            name, measurement, ingredient, *steps = lines
        draft = {
            "name": name,
            "servings": 2,
            "active_cook_time": 10,
            "inactive_cook_time": None,
            "notes": "Imported by the mock.",
            "ingredients": [
                {"amount_numerator": 3, "amount_denominator": 2, "measurement": measurement, "ingredient": ingredient, "preparation": None}
            ],
            "requirements": [],
            "steps": steps,
        }
        reply = {
            "id": "msg_mock",
            "type": "message",
            "role": "assistant",
            "model": body["model"],
            "content": [{"type": "text", "text": json.dumps(draft)}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }
        data = json.dumps(reply).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


ThreadingHTTPServer(("", 8080), Handler).serve_forever()
