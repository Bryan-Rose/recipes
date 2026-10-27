# Recipes!

The goal of this application is to 
Oh also learn python and demostrate working knowledge with it

## AI/LLM Use

LLMs were used to generate the front end. The backend was written by hand, though LLMs were sometimes used to troubleshoot and suggest fixes or patterns

## Running

The full stack runs with Docker Compose: nginx serves the frontend and proxies
`/api` to the FastAPI backend, and the SQLite database lives in `./data`.

```bash
cp .env.example .env              # optional: port, HTTPS cookies, OIDC SSO
docker compose up -d --build
docker compose exec backend python -m scripts.create_user <you> --admin
```

Then open http://localhost:8080. That first admin adds everyone else from the
**Users** page in the header. To update after pulling changes, run
`docker compose up -d --build` again. Back up by copying `data/app.db`
(stop the stack first). If your user id isn't 1000, set `RECIPES_UID`/`RECIPES_GID`.


## Deploying behind Caddy

The stack listens on `127.0.0.1:8080` (frontend container), so only a reverse
proxy on the same host can reach it. Caddy terminates HTTPS and proxies everything
to it; nginx in the frontend container handles `/api` itself.

**First deploy**, on the server:

```bash
git clone https://github.com/Bryan-Rose/recipes.git && cd recipes
cp .env.example .env
#   set RECIPES_COOKIE_SECURE=true (required behind HTTPS)
#   set RECIPES_UID/RECIPES_GID if your user isn't 1000 (`id -u`, `id -g`)
#   optional SSO: RECIPES_OIDC_* with redirect URI https://<your-domain>/api/auth/oidc/callback
docker compose up -d --build
docker compose exec backend python -m scripts.create_user <you> --admin
```

**Caddy on the host.** Add to the Caddyfile and reload Caddy:

```
recipes.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

**Caddy in Docker** (the production setup). `compose.server.example.yml` is the
server's compose file. The frontend runs as container `whattoeat` on Caddy's
external `rproxy` network, with no host port. Copy it to the git-ignored
`compose.server.yml`, and point compose at it from `.env` so plain
`docker compose` commands use it and `git pull` never conflicts with your edits:

```bash
cp compose.server.example.yml compose.server.yml
echo 'COMPOSE_FILE=compose.server.yml' >> .env
docker compose up -d --build
```

Caddy reaches nginx by the container's `hostname` (Docker's network DNS resolves it)
on the container's own port, **80**, not the host port:

```
reverse_proxy whattoeat.docker.internal:80
```

When `compose.yml` changes upstream (a new setting or healthcheck), carry the
change over to `compose.server.yml` by hand.

**Updating:** rebuild. Migrations run automatically when the backend starts, in
one transaction, so a migration that fails leaves the database as it was. Before
migrating, the backend copies the database to `data/app.db.pre-<revision>.bak`
(the revision it was at), so a migration that succeeds but mangles data can be
undone by stopping the stack and copying the backup over `data/app.db`. Backups
are never pruned; delete old ones once you're happy with the update.

```bash
git pull
docker compose up -d --build
```

**Backups:** the whole database is `data/app.db`. Stop the backend for a consistent copy:

```bash
docker compose stop backend && cp data/app.db "app-$(date +%F).db" && docker compose start backend
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
