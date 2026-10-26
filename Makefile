# Single entry point for checks, used by people, agents and CI.
#   make check       fast tier: run before every commit
#   make check-full  everything, incl. API fuzzing and browser e2e against the Docker stack (CI)

.PHONY: check check-full backend-check frontend-check contract-check fuzz e2e

check: backend-check frontend-check contract-check

check-full: check fuzz e2e

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

# Browser tests (Playwright) against the real Docker stack plus a mock OIDC IdP,
# as a separate compose project with a throwaway database. Report and failure
# traces land in e2e/out (open e2e/out/report/index.html).
E2E := docker compose -p recipes-e2e -f compose.yml -f e2e/compose.e2e.yml --profile e2e

# The e2e runner writes e2e/out as this user (CI runners aren't uid 1000).
e2e: export RECIPES_UID ?= $(shell id -u)
e2e: export RECIPES_GID ?= $(shell id -g)

e2e:
	mkdir -p e2e/out
	$(E2E) down -v --remove-orphans
	$(E2E) build
	$(E2E) up -d --wait backend frontend mock-idp
	printf '%s' cook-password | $(E2E) exec -T backend python -m scripts.create_user cook --full-name "Home Cook" --password-stdin
	printf '%s' admin-password | $(E2E) exec -T backend python -m scripts.create_user admin --full-name Admin --admin --password-stdin
	$(E2E) run --rm e2e; status=$$?; $(E2E) down -v --remove-orphans; exit $$status
