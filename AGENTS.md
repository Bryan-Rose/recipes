## Project state

Two projects in one repo:

- `backend/` — FastAPI app managed by [uv], Python 3.14. Layered as `models/` → `schemas/` → `services/` → `routers/`, with CRUD routes for recipes (and their nested steps, requirements, ingredients) plus authors, cookbooks, ingredients, measurements, preparations, tags, and users. Passwords are hashed with stdlib scrypt in `services/users.py`. pytest suite in `backend/tests/`. No auth (new recipes use a placeholder user id) and no Alembic.
- `frontend/` — React 19 + TypeScript on Vite 8, using react-router and TanStack Query. It talks to the API through the Vite dev proxy (`/api` → `:8000`). See `frontend/README.md` for its structure and the API limitations that shape the UI. No frontend tests.

## Commands

Backend (run from `backend/`):

```bash
uv sync                                  # install/refresh deps from uv.lock
uv run uvicorn app.main:app --reload     # dev server on :8000
uv run pytest                            # tests
uv run ruff check .                      # lint
uv run python -m scripts.init_db [--reset]  # create local app.db and seed sample data
docker build -t recipes-api . && docker run -p 8000:8000 recipes-api
```

Frontend (run from `frontend/`):

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b, then vite build — typecheck is part of the build
npm run lint     # oxlint
npm run gen:api  # regenerate src/api/schema.d.ts from the running API — rerun after backend schema changes
```

Note `npm run build` is also the typecheck: `tsconfig.app.json` sets `noEmit`, so `tsc -b` only validates. Run it to check types without a full build.

## Things that will bite you

- **The backend project root is `backend/`, not the repo root.** `pyproject.toml` lives there, so that's where uv anchors the environment (`backend/.venv`). Running `uv` from the repo root creates a second, wrong venv. Always `cd backend` and go through `uv run` rather than activating a venv by hand.
- **`backend/pyproject.toml` declares `readme = "README.md"`, but `backend/README.md` does not exist.** This is inert today — there's no `[build-system]` table, so uv treats the project as virtual and never builds it. Adding a build backend without creating that file (or dropping the key) will break the build. The `description` field is also still the `uv init` placeholder.
- **`app/` is importable only because the process runs from `backend/`.** Nothing installs the package; `uvicorn app.main:app` works because `backend/` is on `sys.path`. The Dockerfile reproduces this by `COPY . .` into `WORKDIR /app` and launching from there.
- **Model files use `TYPE_CHECKING`-guarded imports for cross-model relationships** (e.g. `recipe.py` importing `User`/`Cookbook`/`Ingredient`/`Measurement` only under `if TYPE_CHECKING:`). A real, unguarded import between these files creates a circular import and crashes on load — always guard the other side's import the same way when adding a new relationship.
- **`relationship(back_populates=...)` must name the attribute on the *other* class** — not a table name, and not the same relationship's own name (both mistakes have happened here). Getting this wrong doesn't fail at import time; it fails at `configure_mappers()` / first-query time, so it's easy to miss until something actually queries the relationship.
- **SQLite foreign keys are enforced.** `app/database.py` turns on `PRAGMA foreign_keys=ON` for every SQLite connection, including the tests' in-memory engine. Any row you insert, in app code, tests, or `scripts/init_db.py`, must reference rows that already exist, and deleting a row that is still referenced fails.
- **`IntegrityError` becomes 409 app-wide.** A handler in `app/main.py` maps it to a 409 Conflict. Don't catch it per-route. A relationship without `cascade="all, delete-orphan"` makes SQLAlchemy NULL the child's foreign key on delete, which fails on non-nullable columns and also shows up as a 409. Add the cascade for owned children; for shared entities, the 409 is the intended "still in use" behavior.
- **Tests always contain placeholder user 999.** `POST /recipes/` attributes every recipe to user 999 (no auth yet), so `tests/conftest.py` inserts that user into every test database (`PLACEHOLDER_USER_ID`). User list tests must allow for it, and not-found tests must not use 999 as a missing user id.
- **The test client shares one session across requests.** The `get_db` override in `conftest.py` rolls back on exceptions. Keep that if you change the override, or every request after a failed one raises `PendingRollbackError`.

## Backend data model

- **This is a shared collection, not per-user recipe boxes.** Every user sees every recipe. `Recipe.created_user_id` is attribution only (who added it) — it is not a visibility or ownership filter, so list/read endpoints should never scope by the requesting user.
- **Owned vs. shared entities, reflected in both models and schemas.** `Step`, `Requirement`, and `RecipeIngredient` only exist nested inside a `Recipe` — no standalone routes, no schema without a parent `Recipe` in context. `Ingredient`, `Measurement`, `Cookbook`, and `User` are independent resources with their own model/schema files and their own CRUD. Schemas reference the latter by id on `Create`/`Update` (e.g. `RecipeIngredientCreate.ingredient_id: int`) but nest the full object on `Read` (e.g. `RecipeIngredientRead.ingredient: IngredientRead`) so clients don't need extra round trips to resolve names.
- **No Alembic yet.** `Base.metadata.create_all()` (used ad hoc / in tests) only creates tables that don't exist — it never alters an existing table, so it is not a substitute for migrations. Setting up Alembic is a known, deliberately deferred gap.

## Backend configuration

`app/config.py` uses pydantic-settings with an `@lru_cache`'d `get_settings()`. Settings load from `backend/.env` (see `.env.example`); field names map to env vars case-insensitively, so `app_name` ← `APP_NAME`. Because of the cache, environment changes require a process restart, and tests that need different settings must call `get_settings.cache_clear()`.

## Frontend configuration

The React Compiler is enabled via a Babel preset in `vite.config.ts`, so components are auto-memoized — don't add manual `useMemo`/`useCallback`/`memo` for performance without a measured reason. Linting is oxlint (not ESLint), configured in `.oxlintrc.json`.

[uv]: https://docs.astral.sh/uv/
