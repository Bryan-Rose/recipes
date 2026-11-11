"""A stand-in for the Claude Messages API, for e2e only.

It "parses" the pasted recipe by line: name, measurement, ingredient, then one
step per remaining line. So a test controls every name and can keep them unique.
Photos can't be read that way, so they give a fixed recipe with one step per photo.
"""

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
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
