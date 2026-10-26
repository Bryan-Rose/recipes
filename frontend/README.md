# Recipes — frontend

React 19 + TypeScript on Vite 8, talking to the FastAPI app in `../backend`.

## Running

The frontend needs the API running alongside it. Two terminals:

```bash
# terminal 1 — from backend/
uv run python -m scripts.init_db    # create/migrate the schema + seed data (safe to rerun)
uv run python -m scripts.create_user <you> --admin   # first time only: your login
uv run uvicorn app.main:app --reload

# terminal 2 — from frontend/
npm install
npm run dev                          # http://localhost:5173
```

## Commands

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b, then vite build — the typecheck is part of the build
npm run lint     # oxlint
npm run gen:api  # regenerate src/api/schema.d.ts from the backend (in-process, no server needed)
npm run check:api  # fail if schema.d.ts is stale (part of `make check`)
```

## How it talks to the API

**The dev server proxies `/api/*` to `localhost:8000`** (see `vite.config.ts`). The
backend has no CORS middleware, so this is what keeps every request same-origin
from the browser's point of view. A real deployment needs either CORS on the API
or a reverse proxy in front of both.

**Types are generated, not hand-written.** `npm run gen:api` reads the API's
OpenAPI schema (imported in-process) and writes `src/api/schema.d.ts`.
The Pydantic schemas are the single source of truth. `npm run check:api` (part of
`make check`) fails if the file is stale; once regenerated, a backend change that
breaks the frontend shows up as a `npm run build` failure. Don't edit
`schema.d.ts` — `src/api/types.ts` holds the friendly aliases everything else
imports.

**Trailing slashes are load-bearing, and asymmetric.** Collection routes require
one (`/recipes/`), item routes reject it (`/recipes/1`). Either mistake earns a
307, and a redirected POST or PATCH can silently lose its body, so `client.ts`
never rewrites a path.

## Layout

```
src/
  api/        client.ts (fetch wrapper), errors.ts, types.ts,
              recipes.ts + lookups.ts (TanStack Query hooks), schema.d.ts (generated)
  components/ drafts.ts (form-shaped types), pickers, shared form pieces
  routes/     RecipeList, RecipeDetail, RecipeEdit → Create/EditRecipeForm
  styles/     tokens.css — the whole palette, light and dark
```

## Why the editor works two different ways

The API is asymmetric about nesting. `RecipeCreate` accepts steps, requirements,
and ingredients inline, so **a new recipe** is assembled entirely in local state
and saved with one POST. `RecipeUpdate` takes scalar fields only, so **an
existing recipe's** children have to go through their own nested routes — that
form saves each child as you change it, rather than diffing the whole tree.

## Known API limitations that shape the UI

- **Ingredient amounts are integers.** There is no way to enter "½ cup" until
  `RecipeIngredient.amount` stops being an `Integer` column.
- **Every ingredient needs a preparation.** `preparation_id` is non-nullable, so
  the seed data includes a neutral `whole` that the UI hides when displaying.
- **Duplicate names return 409.** The pickers still match against the
  already-loaded list before offering to create a new row, to avoid the round trip.
- **No pagination or search on the API.** `GET /recipes/` returns every recipe
  fully nested; the list page filters client-side.
- **Session-cookie auth.** `App.tsx` shows `LoginPage` until `/auth/me` succeeds. Any 401 marks the user
  signed out (see `main.tsx`). SSO is a full-page navigation to `/api/auth/oidc/login`, not a fetch.
