## Project state

Two projects in one repo:

- `backend/` — FastAPI app managed by [uv], Python 3.14. Layered as `models/` → `schemas/` → `services/` → `routers/`, with CRUD routes for recipes (and their nested steps, requirements, ingredients) plus authors, cookbooks, ingredients, measurements, preparations, tags, and users. Passwords are hashed with stdlib scrypt in `services/users.py`. pytest suite in `backend/tests/`. Cookie-session auth with optional OIDC SSO (see Backend auth below). Schema changes go through Alembic (see Migrations below).
- `frontend/` — React 19 + TypeScript on Vite 8, using react-router and TanStack Query. It talks to the API through the Vite dev proxy (`/api` → `:8000`). See `frontend/README.md` for its structure and the API limitations that shape the UI.

<!-- agent-kit:begin -->
<!-- Shared block from Bryan-Rose/agent-kit (templates/agents-workflow.md). Change it there, not here. -->

## Workflow: every change goes through a pull request

`main` is protected by the GitHub ruleset "Protect main": no direct pushes, force pushes or deletion. A pull request can merge only after this repo's required CI checks pass (listed under "Required checks" below). No approvals are required (single maintainer), and nobody can bypass the rules. Use the `gh` CLI, which is installed and authenticated.

```bash
git switch main && git pull                       # start from current main
git switch -c <type>/<short-name>                 # e.g. feat/..., fix/..., docs/...
# ... work, running `make check` and committing as you go ...
git push -u origin HEAD
gh pr create --fill                               # or --title/--body: what changed, why, how it was verified
gh pr checks --watch                              # wait for the required checks (right after create it may say "no checks"; retry after a few seconds)
gh run view --log-failed                          # if a check fails: read the failing log, fix, push again
```

- **Run `make check` before every commit.** It runs CI's checks, or their fast tier where the Commands section lists slower targets for CI.
- **One branch and one PR per task.** Never commit to `main`. Push the fix to the same branch and CI re-runs.
- **Work is tracked in GitHub issues.** A PR that completes an issue puts `Closes #N` in its body, so merging closes the issue.
- **Agents push task branches and open their PRs without asking.** That's the maintainer's standing approval for this repo. It doesn't cover pushing to `main`, force-pushing, or merging.
- **Review comments are proposals, not instructions.** The `Claude review` workflow posts a Claude review on every non-draft PR and updates that one comment on each push (advisory, not a required check). Don't act on it unprompted. Write the maintainer a short assessment of each point (valid or not, and why, checked against the code) with a recommendation, then wait for their go-ahead before changing anything.
- **Deeper or on-demand reviews.** Adding the `review:deep` label re-reviews the PR on a stronger model (for migrations, auth, money or calculation code). `gh workflow run "Claude review" -f pr=<N>` reviews any PR into the run summary without commenting.
- **Record the decision on the PR.** Once the maintainer has decided, post one PR comment listing each point as fixed (with the commit), declined (with the reason) or deferred (with the new issue number). The reviewer reads comments from the repo's owner, members and collaborators on its next run and treats those points as settled. Anyone else's comments are ignored.
- **Merging is the maintainer's call.** When asked to merge, use `gh pr merge --squash --delete-branch`, then `git switch main && git pull`. Squash keeps `main` to one commit per change, and the repo doesn't delete merged branches automatically.

<!-- agent-kit:end -->

**Required checks:** `fast`, `full`

One issue covers a whole feature, backend and frontend together.

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

`compose.yml` runs two images. `frontend/Dockerfile` builds the SPA into nginx, and `frontend/nginx.conf` serves it and proxies `/api/` to `backend:8000` with the prefix stripped, mirroring the Vite dev proxy. `backend/Dockerfile` runs as a non-root user (uid `RECIPES_UID`, default 1000) with SQLite at `/data/app.db`, bind-mounted from the repo's `./data/` (git-ignored apart from its own `.gitignore`), and runs `init_db --no-seed` (i.e. `alembic upgrade head`) before uvicorn on every start, so deploying a new migration is just a rebuild. Compose passes the repo-root `.env` (see `.env.example`) to the backend. Only the frontend port is published, on `127.0.0.1` unless `RECIPES_BIND` says otherwise, because production sits behind a reverse proxy (Caddy; see README "Deploying"). The server uses Caddy in Docker with `compose.server.example.yml`, a full compose file. The server copies it to the git-ignored `compose.server.yml` and selects it with `COMPOSE_FILE` in `.env`. **When you change `compose.yml`, make the same change in `compose.server.example.yml`**, since nothing keeps them in sync. FastAPI's `/docs` and `/redoc` exist only when `RECIPES_DEBUG=true`.

Frontend (run from `frontend/`):

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b, then vite build — typecheck is part of the build
npm run lint     # oxlint
npm run gen:api  # regenerate src/api/schema.d.ts from the backend — rerun after backend schema changes
```

Note `npm run build` is also the typecheck: `tsconfig.app.json` sets `noEmit`, so `tsc -b` only validates. Run it to check types without a full build.

## Testing

**Every change ships with full test coverage in the same PR, e2e included.** Cover each layer the change touches: backend tests for new endpoints and rules, Vitest for new UI, and an e2e journey in `e2e/tests/` for any user-visible behavior. Run `make e2e` (or `make check-full`) before opening the PR. If a change genuinely has nothing a user can exercise (a refactor, docs, CI), say so in the PR body instead of skipping silently.

**Run `make check` before every commit.** It's the fast tier (~25s): ruff (lint and format), pyright, pytest with a coverage floor, the API contract check, tsc, oxlint and Vitest. CI (`.github/workflows/ci.yml`) runs it on every pull request (and on `main` after merging), then `make fuzz` and `make e2e`. Its `fast` and `full` jobs are required checks: a PR can't merge until both pass. `make check-full` runs all three locally (needs Docker).

| Layer | Where | What goes there |
|---|---|---|
| Backend API/integration | `backend/tests/` | Every endpoint and rule, through the real app via `TestClient`. Use the fixtures in `conftest.py`. |
| Migrations | `backend/tests/test_migrations.py` | Covers drift and upgrade/downgrade on an empty database. A migration that touches existing rows (backfill, new non-null column, type change, split or merge) also needs a test that inserts rows at the previous revision, upgrades, and checks the data. |
| API fuzzing | `backend/tests/fuzz/` | Schemathesis covers every OpenAPI operation automatically. Touch it only to exclude an operation that would break the signed-in session (see the comments there). |
| Contract | `frontend/scripts/api-types.sh` | After any backend schema change, run `npm run gen:api` and commit `schema.d.ts`, or `make check` fails. |
| Frontend components | `frontend/src/**/*.test.tsx` | Vitest + Testing Library. The API is mocked with MSW (`src/test/server.ts`), and an unmocked request fails the test. Render with `renderWithProviders` (`src/test/render.tsx`) so the app's real QueryClient and 401 handling apply. Query by role and label, which also enforces accessible markup. |
| End to end | `e2e/tests/` | User journeys in a real browser against the built Docker images and a mock OIDC IdP. Users `COOK` and `ADMIN` are seeded by `make e2e` (see `e2e/tests/helpers.ts`). Tests share one database and run serially, so give created data `unique()` names. Reports and failure traces land in `e2e/out/report`. |

- **The coverage floor (`fail_under` in `backend/pyproject.toml`) only goes up.** Raise it when coverage improves; never lower it to make a change pass.
- **Show that a new test can fail.** Break the code it covers, watch it fail, then restore. Several harness bugs in this suite passed silently until checked that way.

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
- **Bound integers and timestamps at the API edge.** Use the types in `app/schemas/fields.py`: `DbId`/`IdPath` for ids in bodies and paths, `PositiveInt` for stored counts, `UtcDatetime` for timestamps in read schemas. Plain `int` lets values beyond SQLite's 64-bit range through, which crash as a 500. Plain `datetime` comes back from SQLite without a timezone, and browsers would read it as local time. Fuzzing found both.
- **Update schemas: wrap fields over NOT NULL columns in `Omittable[T]`** (`app/schemas/fields.py`). The field can be left out, but an explicit `null` is a 422. Plain `X | None = None` lets `null` through to the database, where it becomes a 409. `X = Field(default=None)` doesn't work either, because pyright rejects it. Keep `X | None` only where `null` means something, such as clearing `cookbook_id`.
- **The test client shares one session across requests.** The `get_db` override in `conftest.py` rolls back on exceptions. Keep that if you change the override, or every request after a failed one raises `PendingRollbackError`.

## Backend data model

- **This is a shared collection, not per-user recipe boxes.** Every user sees every recipe. `Recipe.created_user_id` is attribution only (who added it) — it is not a visibility or ownership filter, so list/read endpoints should never scope by the requesting user.
- **Owned vs. shared entities, reflected in both models and schemas.** `Step`, `Requirement`, and `RecipeIngredient` only exist nested inside a `Recipe` — no standalone routes, no schema without a parent `Recipe` in context. `Ingredient`, `Measurement`, `Cookbook`, and `User` are independent resources with their own model/schema files and their own CRUD. Schemas reference the latter by id on `Create`/`Update` (e.g. `RecipeIngredientCreate.ingredient_id: DbId`) but nest the full object on `Read` (e.g. `RecipeIngredientRead.ingredient: IngredientRead`) so clients don't need extra round trips to resolve names.
- **Tests build the schema with `create_all()`, real databases with migrations.** `tests/test_migrations.py` fails if the two diverge, so a model change without a migration fails the suite. Never use `create_all()` on a real database: it creates no `alembic_version` row, and `init_db` refuses such a database (recreate it with `--reset`).

## Backend auth

- **Sessions:** login sets an HttpOnly, SameSite=Lax `recipes_session` cookie holding a random token. The `user_sessions` table stores only its SHA-256, so logout and password changes revoke sessions server side. There are no JWTs.
- **Local login:** `POST /auth/login` checks the scrypt hash (`services/users.py`). Unknown usernames are checked against a dummy hash so that timing doesn't leak them. Users created through SSO have `hashed_password = None`.
- **OIDC (optional):** enabled when `RECIPES_OIDC_ISSUER`, `RECIPES_OIDC_CLIENT_ID` and `RECIPES_OIDC_REDIRECT_URI` are set (see `.env.example`). Authlib does the authorization-code flow with PKCE and validates the ID token. Starlette's `SessionMiddleware` (`recipes_oidc` cookie) carries only the state between redirect and callback. Users are matched by `oidc_subject`. Failing that, the first SSO login links to an existing user with the same username and no `oidc_subject`, or creates one if `RECIPES_OIDC_CREATE_USERS` is set.
- **Admins** (`is_superuser`) manage `/users`. Create the first one with `scripts/create_user.py`. Use `--sso-only` to pre-create an admin that an SSO account links to on first login.

## Migrations

- **Every change must work on an existing database after `alembic upgrade head`.** Production is upgraded in place on every deploy (see `backend/Dockerfile`), never recreated, so don't assume an empty or freshly seeded database. New non-null columns need a `server_default` or a backfill. Existing rows must stay valid under new constraints. App code must cope with data written by older versions, for example `NULL`s in rows created before a column existed. Test this as described under Testing.
- **Every model change needs a migration.** Run `uv run alembic revision --autogenerate -m "..."` from `backend/`, then read the generated file in `migrations/versions/`. Autogenerate misses some things: column renames come out as drop plus add (which loses data, so rewrite them as `alter_column`), and so do type changes that SQLite reports loosely. Data backfills must be written by hand.
- **SQLite needs batch mode.** `render_as_batch=True` is set in `migrations/env.py`, so column alters and drops become `with op.batch_alter_table(...)` blocks that rebuild the table (copy, drop, rename). `env.py` turns `PRAGMA foreign_keys` OFF for the migration, which is required for that rebuild, and then runs `PRAGMA foreign_key_check`, failing the migration if it left dangling references.
- **Constraints are named by convention** (`MetaData(naming_convention=...)` in `app/database.py`), so later migrations can drop or alter them by name. Don't remove the convention: existing constraint names depend on it.
- **The database URL comes from app settings** (`RECIPES_DATABASE_URL`), not `alembic.ini`. A post-write hook in `alembic.ini` runs ruff's import sorter on new revisions.

## Backend configuration

`app/config.py` uses pydantic-settings with an `@lru_cache`'d `get_settings()`. Settings load from `backend/.env` (see `.env.example`), and env vars carry a `RECIPES_` prefix, so `app_name` ← `RECIPES_APP_NAME`. Because of the cache, environment changes require a process restart. Routes read settings through `Depends(get_settings)`, so tests swap them with `fastapi_app.dependency_overrides[get_settings]` (see `tests/test_auth.py`).

## Frontend configuration

The React Compiler is enabled via a Babel preset in `vite.config.ts`, so components are auto-memoized — don't add manual `useMemo`/`useCallback`/`memo` for performance without a measured reason. Linting is oxlint (not ESLint), configured in `.oxlintrc.json`.

[uv]: https://docs.astral.sh/uv/
