# Single entry point for checks, used by people, agents and CI.
#   make check       fast tier: run before every commit
#   make check-full  everything, incl. API fuzzing and browser e2e against the Docker stack (CI)

.PHONY: check check-full backend-check frontend-check contract-check fuzz

check: backend-check frontend-check contract-check

check-full: check fuzz

backend-check:
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .
	cd backend && uv run pyright
	cd backend && uv run pytest -q --cov

frontend-check:
	cd frontend && npm run build
	cd frontend && npm run lint
	cd frontend && npm test

# The frontend's generated API types must match the backend's OpenAPI schema.
contract-check:
	cd frontend && npm run check:api

# Schemathesis: generated requests against every API operation (~1-2 min).
fuzz:
	cd backend && uv run pytest -m fuzz -p no:cacheprovider
