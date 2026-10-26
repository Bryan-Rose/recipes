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

Then open http://localhost:8080. To update after pulling changes, run
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

**Caddy in Docker** (the production setup). A container can't reach the host's
loopback, so the frontend joins Caddy's Docker network instead. Use the example
override, which assumes that network is called `rproxy`:

```bash
cp compose.override.example.yml compose.override.yml   # git-ignored; compose loads it automatically
docker compose up -d --build
```

and proxy to it with `reverse_proxy recipes:80`. Only the frontend joins `rproxy`.
Its nginx reaches the backend over the stack's private network, so other containers
on `rproxy` can't call the API around it. The server's own config then lives in
`compose.override.yml`, so `git pull` keeps `compose.yml` current with no merge
conflicts.

**Updating:** back up, then rebuild. Migrations run automatically when the backend starts.

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
