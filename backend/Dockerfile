FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.26 /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY . .
RUN uv sync --locked --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    RECIPES_DATABASE_URL="sqlite:////data/app.db"

# Run unprivileged. compose.yaml bind-mounts ./data over /data and may override the uid.
RUN useradd --system --uid 1000 recipes && mkdir /data && chown recipes /data
USER recipes

EXPOSE 8000

# create_all only adds missing tables; it never alters existing ones (see AGENTS.md on Alembic).
CMD ["sh", "-c", "python -m scripts.init_db --no-seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
