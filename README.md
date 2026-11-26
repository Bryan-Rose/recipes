# Recipes

A self-hosted recipe box shared by everyone in a household.

- Recipes with steps, ingredients, servings scaling and a photo,
  filed by cookbook, author and tag
- Import from pasted text, photos of cookbook pages or a web link
  (Claude API, optional)
- A shared meal plan and shopping list that sums ingredients
- Password login and optional OIDC single sign-on

## AI/LLM Use

The backend began hand-written. Most code is now written by AI agents (Claude Code)
through reviewed pull requests, guided by `AGENTS.md`.

## Running

The full stack runs with Docker Compose: nginx serves the frontend and proxies
`/api` to the FastAPI backend. The SQLite database, uploaded images and import originals live in `./data`.

```bash
cp .env.example .env              # optional: port, HTTPS cookies, OIDC SSO, recipe import
docker compose up -d --build
docker compose exec backend python -m scripts.create_user <you> --admin
docker compose exec backend python -m scripts.seed_lookups   # optional: starter measurements, preparations, ingredients
```

Then open http://localhost:8080. That first admin adds everyone else from the
**Users** page in the header. To update after pulling changes, run
`docker compose up -d --build` again. To back up, see **Backups** below.
If your user id isn't 1000, set `RECIPES_UID`/`RECIPES_GID`.

## Deploying behind Caddy

The frontend container is the only way in, and only a reverse proxy should reach
it. Caddy terminates HTTPS and proxies everything to it; nginx in the frontend
container handles `/api` itself.

**Caddy in Docker** (the production setup). The deploy folder holds the
server's own files, and the source is a git clone in its `src/` subfolder:

```
recipes/
├── compose.yml   # copied from src/compose.server.example.yml; builds from ./src
├── .env          # copied from src/.env.example
├── data/         # database, images, import originals
└── src/          # git clone
```

The frontend runs as container `whattoeat` on the external Docker network
`rproxy`, which Caddy's container must also join, with no host port. Compose
doesn't create an external network, so it must exist first. **First deploy**:

```bash
mkdir recipes && cd recipes
git clone https://github.com/Bryan-Rose/recipes.git src
cp src/compose.server.example.yml compose.yml
cp src/.env.example .env
mkdir data                 # owned by RECIPES_UID/RECIPES_GID (default 1000)
#   in .env: set RECIPES_COOKIE_SECURE=true (required behind HTTPS)
#   set RECIPES_UID/RECIPES_GID if your user isn't 1000 (`id -u`, `id -g`)
#   optional import: RECIPES_ANTHROPIC_API_KEY
#   optional SSO: RECIPES_OIDC_* with redirect URI https://<your-domain>/api/auth/oidc/callback,
#     RECIPES_SECRET_KEY, and RECIPES_OIDC_CREATE_USERS (see below)
docker network inspect rproxy >/dev/null 2>&1 || docker network create rproxy
docker compose up -d --build
docker compose exec backend python -m scripts.create_user <you> --admin
docker compose exec backend python -m scripts.seed_lookups   # optional: starter measurements, preparations, ingredients
```

Run `docker compose` from the deploy folder, not `src/`. Caddy reaches nginx by
the container's `hostname` (Docker's network DNS resolves it) on the container's
own port, **80**:

```
recipes.example.com {
	encode zstd gzip
	reverse_proxy whattoeat.docker.internal:80
}
```

`encode` compresses responses. nginx in the frontend container already gzips, and
Caddy passes that through, but `encode` also gives zstd to browsers that support it.
The recipe list (`GET /api/recipes/`) carries every recipe, so compression matters
on slow connections.

When `src/compose.server.example.yml` changes upstream (a new setting or
healthcheck), carry the change over to `compose.yml` by hand.

**Caddy on the host.** Run the stack from the clone itself, as under **Running**
(with `RECIPES_COOKIE_SECURE=true` in `.env`). It listens on `127.0.0.1:8080`;
add to the Caddyfile and reload Caddy:

```
recipes.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

**Who can sign in with SSO.** `RECIPES_OIDC_CREATE_USERS` defaults to `true`:
anyone your identity provider lets into this client gets an account on their
first SSO login. To admit only people you've added, set it to `false` and create
each one with `create_user <name> --sso-only` (add `--admin` for admins); they
are linked on first login by the IdP's `preferred_username`.

**Login rate limit.** nginx allows each client address about 10 password logins a
minute after a burst of 30, and answers 429 beyond that (`frontend/nginx.conf`). It
takes the address from the last `X-Forwarded-For` entry when the request comes from
a private address (Caddy on the host or in Docker), so keep a proxy in front: with
`RECIPES_BIND=0.0.0.0`, clients on the LAN could set that header themselves.

**Updating:** pull and rebuild, from the deploy folder:

```bash
git -C src pull
docker compose up -d --build
```

(With Caddy on the host, plain `git pull` in the clone.)

Migrations run automatically when the backend starts, in
one transaction, so a migration that fails leaves the database as it was. Before
migrating, the backend copies the database to
`data/app.db.pre-<revision>-<UTC timestamp>.bak` (the revision it was at), so a
migration that succeeds but mangles data can be undone by stopping the stack and
copying the backup over `data/app.db`. These copies hold the database only, not
images (migrations don't touch them). An existing copy is never overwritten, and
copies are never pruned; delete old ones once you're happy with the update.

**Rolling back** to an older image works the same way. An older image can't run
against a newer schema (writes fail), and deploys never run downgrade
migrations. Stop the stack, copy the newest backup named for the revision the
older image runs (`data/app.db.pre-<that revision>-*.bak`, not necessarily the
newest backup overall) over `data/app.db`, then start the older image. Changes
made since the update are lost. Images from before the 1.0 baseline migration
can't be rolled back to: their databases must be recreated with `init_db --reset`.

**Backups:** everything the app stores is in `data/`: the database `app.db` and
recipe and cookbook images in `images/`, and what each import was read from in
`imports/` (both named by the database, so back them up together).
Stop the backend for a consistent copy:

```bash
docker compose stop backend && cp -a data "recipes-$(date +%F)" && docker compose start backend
```

## Development

```bash
make check       # fast checks: run before every commit (~25s)
make fuzz        # API fuzzing with Schemathesis (~1-2 min)
make e2e         # Playwright browser tests against the Docker stack and a mock SSO provider
make check-full  # all of the above, as CI runs it
```

All changes land through pull requests: `main` is protected, and a PR can
merge only once CI's `fast` and `full` checks pass. See the Workflow section
of `AGENTS.md` for the branch, `gh pr create`, and merge steps.

See `AGENTS.md` for how the codebase and its tests are organised, and
`frontend/README.md` for frontend specifics.
