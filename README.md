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
