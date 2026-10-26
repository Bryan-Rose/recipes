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

