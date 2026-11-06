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


def test_fractions_and_optional_preparation_migrate_existing_rows(alembic_config: Config):
    command.upgrade(alembic_config, "f09df3d53f43")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        for sql in (
            "INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)",
            "INSERT INTO recipes (id, name, created_user_id) VALUES (1, 'r', 1)",
            "INSERT INTO ingredients (id, name) VALUES (1, 'egg')",
            "INSERT INTO measurements (id, name) VALUES (1, 'whole')",
            "INSERT INTO preparations (id, name) VALUES (1, 'whole'), (2, 'beaten')",
            (
                "INSERT INTO recipe_ingredients (id, amount, recipe_id, ingredient_id, measurement_id, preparation_id)"
                " VALUES (1, 3, 1, 1, 1, 1), (2, 2, 1, 1, 1, 2)"
            ),
        ):
            connection.execute(text(sql))

    command.upgrade(alembic_config, "f78e129999c4")
    rows = "SELECT id, amount_numerator, amount_denominator, preparation_id FROM recipe_ingredients ORDER BY id"
    with engine.begin() as connection:
        assert connection.execute(text(rows)).all() == [(1, 3, 1, None), (2, 2, 1, 2)]
        assert connection.execute(text("SELECT name FROM preparations")).scalars().all() == ["beaten"]
        assert connection.execute(text("SELECT name FROM measurements")).scalars().all() == ["whole"]  # counted, kept
        connection.execute(text("UPDATE recipe_ingredients SET amount_numerator = 1, amount_denominator = 2 WHERE id = 2"))

    command.downgrade(alembic_config, "f09df3d53f43")
    with engine.connect() as connection:
        whole = connection.execute(text("SELECT id FROM preparations WHERE name = 'whole'")).scalar_one()
        rows = "SELECT id, amount, preparation_id FROM recipe_ingredients ORDER BY id"
        assert connection.execute(text(rows)).all() == [(1, 3, whole), (2, 1, 2)]
    engine.dispose()


def test_servings_become_integers(alembic_config: Config):
    command.upgrade(alembic_config, "f78e129999c4")
    engine = create_engine(alembic_config.attributes["url"])
    servings = [("4",), ("Makes about 12",), ("4-6",), ("a crowd",), ("0",), (None,)]
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        for id_, (value,) in enumerate(servings, start=1):
            connection.execute(
                text("INSERT INTO recipes (id, name, servings, created_user_id) VALUES (:id, :name, :servings, 1)"),
                {"id": id_, "name": f"r{id_}", "servings": value},
            )

    command.upgrade(alembic_config, "9c0d5e609c63")
    rows = "SELECT servings, typeof(servings) FROM recipes ORDER BY id"
    with engine.connect() as connection:
        assert connection.execute(text(rows)).all() == [
            (4, "integer"),
            (12, "integer"),
            (4, "integer"),
            (None, "null"),
            (None, "null"),
            (None, "null"),
        ]

    command.downgrade(alembic_config, "f78e129999c4")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT servings FROM recipes ORDER BY id")).scalars().all() == ["4", "12", "4", None, None, None]
    engine.dispose()
