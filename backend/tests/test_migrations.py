"""The migrations must build exactly the schema the models describe.

The rest of the suite uses Base.metadata.create_all() for speed, so without
this a model change committed without its migration would pass every test and
then break the real database.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.database import Base

BACKEND = Path(__file__).resolve().parent.parent


@pytest.fixture()
def alembic_config(tmp_path: Path) -> Config:
    # No ini file: it would reconfigure logging mid-test-run.
    config = Config()
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.attributes["url"] = f"sqlite:///{tmp_path / 'migrated.db'}"
    return config


def test_migrations_match_models(alembic_config: Config):
    command.upgrade(alembic_config, "head")

    with create_engine(alembic_config.attributes["url"]).connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection, opts={"render_as_batch": True}), Base.metadata)

    assert diff == [], "models and migrations differ; run `uv run alembic revision --autogenerate -m '...'`"


def test_migrations_downgrade_to_empty_and_back(alembic_config: Config):
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")
    engine = create_engine(alembic_config.attributes["url"])

    assert set(inspect(engine).get_table_names()) == {"alembic_version"}

    command.upgrade(alembic_config, "head")
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
