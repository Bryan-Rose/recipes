#!/usr/bin/env bash
# Generate src/api/schema.d.ts from the backend's OpenAPI schema, in-process
# (no running server needed). With --check, fail instead if the committed file
# is stale, i.e. a backend schema change wasn't carried over to the frontend.
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

(cd ../backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))") > "$tmp/openapi.json"
npx openapi-typescript "$tmp/openapi.json" -o "$tmp/schema.d.ts" > /dev/null

if [[ "${1:-}" == "--check" ]]; then
  if ! diff -u src/api/schema.d.ts "$tmp/schema.d.ts"; then
    echo "src/api/schema.d.ts is out of date with the backend. Run: cd frontend && npm run gen:api" >&2
    exit 1
  fi
else
  cp "$tmp/schema.d.ts" src/api/schema.d.ts
fi
