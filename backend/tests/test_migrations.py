"""The migrations must build exactly the schema the models describe.

The rest of the suite uses Base.metadata.create_all() for speed, so without
this a model change committed without its migration would pass every test and
then break the real database.
"""

import shutil
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.database import Base
from scripts.init_db import backup

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

    engine = create_engine(alembic_config.attributes["url"])
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection, opts={"render_as_batch": True}), Base.metadata)
    engine.dispose()

    assert diff == [], "models and migrations differ; run `uv run alembic revision --autogenerate -m '...'`"


def test_migrations_downgrade_to_empty_and_back(alembic_config: Config):
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "base")
    engine = create_engine(alembic_config.attributes["url"])

    assert set(inspect(engine).get_table_names()) == {"alembic_version"}

    command.upgrade(alembic_config, "head")
    assert set(Base.metadata.tables) <= set(inspect(engine).get_table_names())
    engine.dispose()


@pytest.fixture()
def scratch_config(alembic_config: Config, tmp_path: Path) -> Config:
    """alembic_config over a copy of the migrations, so a test can add revisions."""
    shutil.copytree(BACKEND / "migrations", tmp_path / "migrations", ignore=shutil.ignore_patterns("__pycache__"))
    alembic_config.set_main_option("script_location", str(tmp_path / "migrations"))
    return alembic_config


def add_revision(config: Config, upgrade_body: str) -> None:
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    (Path(script.versions) / "next.py").write_text(
        f"from alembic import op\nimport sqlalchemy as sa\n\nrevision = 'next'\ndown_revision = {head!r}\n\n\n"
        f"def upgrade():\n{upgrade_body}\n\n\ndef downgrade():\n    pass\n"
    )


@pytest.mark.parametrize(
    "failure",
    [
        "    op.execute('not sql')",
        # A dangling reference: env.py's foreign key check must roll this back.
        "    op.execute(\"INSERT INTO recipes (name, created_user_id) VALUES ('x', 999)\")",
    ],
)
def test_failed_migration_rolls_back_completely(scratch_config: Config, failure: str):
    command.upgrade(scratch_config, "head")
    before = ScriptDirectory.from_config(scratch_config).get_current_head()
    add_revision(scratch_config, f"    op.create_table('partial', sa.Column('id', sa.Integer, primary_key=True))\n{failure}")

    with pytest.raises(Exception):  # noqa: B017 — any failure will do; the point is what's left behind
        command.upgrade(scratch_config, "head")

    engine = create_engine(scratch_config.attributes["url"])
    with engine.connect() as connection:
        assert "partial" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT count(*) FROM recipes")).scalar() == 0
        assert MigrationContext.configure(connection).get_current_revision() == before
    engine.dispose()


def test_backup_before_migrating(scratch_config: Config):
    engine = create_engine(scratch_config.attributes["url"])
    assert backup(engine, scratch_config) is None  # new database: nothing to lose

    command.upgrade(scratch_config, "head")
    before = ScriptDirectory.from_config(scratch_config).get_current_head()
    assert backup(engine, scratch_config) is None  # already at head

    add_revision(scratch_config, "    pass")
    path = backup(engine, scratch_config)
    engine.dispose()

    assert path == f"{engine.url.database}.pre-{before}.bak"
    copy = create_engine(f"sqlite:///{path}")
    with copy.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == before
    copy.dispose()
