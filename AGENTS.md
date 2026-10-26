## Project state

Two projects in one repo:

- `backend/` — FastAPI app managed by [uv], Python 3.14. Layered as `models/` → `schemas/` → `services/` → `routers/`, with CRUD routes for recipes (and their nested steps, requirements, ingredients) plus authors, cookbooks, ingredients, measurements, preparations, tags, and users. Passwords are hashed with stdlib scrypt in `services/users.py`. pytest suite in `backend/tests/`. Cookie-session auth with optional OIDC SSO (see Backend auth below). Schema changes go through Alembic (see Migrations below).
- `frontend/` — React 19 + TypeScript on Vite 8, using react-router and TanStack Query. It talks to the API through the Vite dev proxy (`/api` → `:8000`). See `frontend/README.md` for its structure and the API limitations that shape the UI. No frontend tests.

## Commands

Backend (run from `backend/`):

```bash
uv sync                                  # install/refresh deps from uv.lock
uv run uvicorn app.main:app --reload     # dev server on :8000
uv run pytest                            # tests
uv run ruff check .                      # lint
uv run python -m scripts.init_db [--reset]  # migrate local app.db to head and seed sample data
uv run alembic revision --autogenerate -m "<what changed>"  # after changing a model; review the file
uv run alembic upgrade head                 # apply migrations (init_db also does this)
uv run python -m scripts.create_user <name> --admin [--sso-only]  # create a login (first admin)
```

Full stack in containers (run from the repo root):

```bash
docker compose up -d --build                                    # http://localhost:8080
docker compose exec backend python -m scripts.create_user <name> --admin
```

`compose.yaml` runs two images. `frontend/Dockerfile` builds the SPA into nginx, and `frontend/nginx.conf` serves it and proxies `/api/` to `backend:8000` with the prefix stripped, mirroring the Vite dev proxy. `backend/Dockerfile` runs as a non-root user (uid `RECIPES_UID`, default 1000) with SQLite at `/data/app.db`, bind-mounted from the repo's `./data/` (git-ignored apart from its own `.gitignore`), and runs `init_db --no-seed` (i.e. `alembic upgrade head`) before uvicorn on every start, so deploying a new migration is just a rebuild. Compose passes the repo-root `.env` (see `.env.example`) to the backend. Only the frontend port is published.

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
- **The test `client` is already signed in, as an admin.** `tests/conftest.py` creates `current_user` (username `admin`, `is_superuser=True`, no password) and gives the client a real session cookie. User list tests must allow for that user. For anonymous requests call `client.cookies.clear()`. To test settings-dependent behavior, override `get_settings` via `fastapi_app.dependency_overrides`.
- **Every router except `/auth` requires login.** It is applied in `app/main.py` with `dependencies=signed_in` on `include_router`. A new router must be added the same way, or it will be public. Admin-only routes use `Depends(require_admin)` from `app/auth.py`.
- **The test client shares one session across requests.** The `get_db` override in `conftest.py` rolls back on exceptions. Keep that if you change the override, or every request after a failed one raises `PendingRollbackError`.

## Backend data model

- **This is a shared collection, not per-user recipe boxes.** Every user sees every recipe. `Recipe.created_user_id` is attribution only (who added it) — it is not a visibility or ownership filter, so list/read endpoints should never scope by the requesting user.
- **Owned vs. shared entities, reflected in both models and schemas.** `Step`, `Requirement`, and `RecipeIngredient` only exist nested inside a `Recipe` — no standalone routes, no schema without a parent `Recipe` in context. `Ingredient`, `Measurement`, `Cookbook`, and `User` are independent resources with their own model/schema files and their own CRUD. Schemas reference the latter by id on `Create`/`Update` (e.g. `RecipeIngredientCreate.ingredient_id: int`) but nest the full object on `Read` (e.g. `RecipeIngredientRead.ingredient: IngredientRead`) so clients don't need extra round trips to resolve names.
- **Tests build the schema with `create_all()`, real databases with migrations.** `tests/test_migrations.py` fails if the two diverge, so a model change without a migration fails the suite. Never use `create_all()` on a real database: it creates no `alembic_version` row, and `init_db` refuses such a database (recreate it with `--reset`).

## Backend auth

- **Sessions:** login sets an HttpOnly, SameSite=Lax `recipes_session` cookie holding a random token. The `user_sessions` table stores only its SHA-256, so logout and password changes revoke sessions server side. There are no JWTs.
- **Local login:** `POST /auth/login` checks the scrypt hash (`services/users.py`). Unknown usernames are checked against a dummy hash so that timing doesn't leak them. Users created through SSO have `hashed_password = None`.
- **OIDC (optional):** enabled when `RECIPES_OIDC_ISSUER`, `RECIPES_OIDC_CLIENT_ID` and `RECIPES_OIDC_REDIRECT_URI` are set (see `.env.example`). Authlib does the authorization-code flow with PKCE and validates the ID token. Starlette's `SessionMiddleware` (`recipes_oidc` cookie) carries only the state between redirect and callback. Users are matched by `oidc_subject`. Failing that, the first SSO login links to an existing user with the same username and no `oidc_subject`, or creates one if `RECIPES_OIDC_CREATE_USERS` is set.
- **Admins** (`is_superuser`) manage `/users`. Create the first one with `scripts/create_user.py`. Use `--sso-only` to pre-create an admin that an SSO account links to on first login.

## Migrations

- **Every model change needs a migration.** Run `uv run alembic revision --autogenerate -m "..."` from `backend/`, then read the generated file in `migrations/versions/`. Autogenerate misses some things: column renames come out as drop plus add (which loses data, so rewrite them as `alter_column`), and so do type changes that SQLite reports loosely. Data backfills must be written by hand.
- **SQLite needs batch mode.** `render_as_batch=True` is set in `migrations/env.py`, so column alters and drops become `with op.batch_alter_table(...)` blocks that rebuild the table (copy, drop, rename). `env.py` turns `PRAGMA foreign_keys` OFF for the migration, which is required for that rebuild, and then runs `PRAGMA foreign_key_check`, failing the migration if it left dangling references.
- **Constraints are named by convention** (`MetaData(naming_convention=...)` in `app/database.py`), so later migrations can drop or alter them by name. Don't remove the convention: existing constraint names depend on it.
- **The database URL comes from app settings** (`RECIPES_DATABASE_URL`), not `alembic.ini`. A post-write hook in `alembic.ini` runs ruff's import sorter on new revisions.

## Backend configuration

`app/config.py` uses pydantic-settings with an `@lru_cache`'d `get_settings()`. Settings load from `backend/.env` (see `.env.example`); field names map to env vars case-insensitively, so `app_name` ← `APP_NAME`. Because of the cache, environment changes require a process restart, and tests that need different settings must call `get_settings.cache_clear()`.

## Frontend configuration

The React Compiler is enabled via a Babel preset in `vite.config.ts`, so components are auto-memoized — don't add manual `useMemo`/`useCallback`/`memo` for performance without a measured reason. Linting is oxlint (not ESLint), configured in `.oxlintrc.json`.

[uv]: https://docs.astral.sh/uv/
