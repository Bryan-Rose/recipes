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
from sqlalchemy.exc import IntegrityError

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


def test_step_positions_follow_insert_order(alembic_config: Config):
    command.upgrade(alembic_config, "425b7165b8d1")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        connection.execute(text("INSERT INTO recipes (id, name, created_user_id) VALUES (1, 'r1', 1), (2, 'r2', 1)"))
        # Interleaved across recipes, so each recipe's numbering must restart at 0.
        connection.execute(
            text("INSERT INTO steps (id, text, recipe_id) VALUES (10, 'a', 1), (11, 'x', 2), (12, 'b', 1), (13, 'y', 2), (14, 'c', 1)")
        )

    command.upgrade(alembic_config, "aa32c8fd9938")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT id, recipe_id, position FROM steps ORDER BY id")).all()
        assert rows == [(10, 1, 0), (11, 2, 0), (12, 1, 1), (13, 2, 1), (14, 1, 2)]
        assert next(c for c in inspect(connection).get_columns("steps") if c["name"] == "position")["nullable"] is False
    engine.dispose()


def test_cookbook_page_cleared_without_cookbook(alembic_config: Config):
    command.upgrade(alembic_config, "aa32c8fd9938")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        connection.execute(text("INSERT INTO authors (id, name) VALUES (1, 'a')"))
        connection.execute(text("INSERT INTO cookbooks (id, name, author_id) VALUES (1, 'c', 1)"))
        connection.execute(
            text(
                "INSERT INTO recipes (id, name, created_user_id, cookbook_id, cookbook_page)"
                " VALUES (1, 'r1', 1, 1, 12), (2, 'r2', 1, NULL, 34), (3, 'r3', 1, NULL, NULL)"
            )
        )

    command.upgrade(alembic_config, "ef8c8e87e99a")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT id, cookbook_id, cookbook_page FROM recipes ORDER BY id")).all()
        assert rows == [(1, 1, 12), (2, None, None), (3, None, None)]
    engine.dispose()


def test_pages_of_deleted_cookbooks_cleared(alembic_config: Config):
    command.upgrade(alembic_config, "ef8c8e87e99a")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        connection.execute(text("INSERT INTO authors (id, name) VALUES (1, 'a')"))
        connection.execute(text("INSERT INTO cookbooks (id, name, author_id) VALUES (1, 'c', 1)"))
        # Recipe 2 is what the old cookbook delete left behind.
        connection.execute(
            text(
                "INSERT INTO recipes (id, name, created_user_id, cookbook_id, cookbook_page)"
                " VALUES (1, 'r1', 1, 1, 12), (2, 'r2', 1, NULL, 34)"
            )
        )

    command.upgrade(alembic_config, "b4941c86400e")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT id, cookbook_id, cookbook_page FROM recipes ORDER BY id")).all()
        assert rows == [(1, 1, 12), (2, None, None)]
    engine.dispose()


def test_cook_times_become_minutes(alembic_config: Config):
    command.upgrade(alembic_config, "b4941c86400e")
    engine = create_engine(alembic_config.attributes["url"])
    recipes = [
        ("20 minutes", "0 minutes", None),
        ("1 hr 15 min", "2h30m", "Use ripe ones"),
        ("2-3 hours", "overnight", "Chill well"),
        (None, None, None),
        ("45", "", None),
        ("²", "9" * 400 + " minutes", None),
    ]
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        for id_, (active, inactive, notes) in enumerate(recipes, start=1):
            connection.execute(
                text(
                    "INSERT INTO recipes (id, name, created_user_id, active_cook_time, inactive_cook_time, notes)"
                    " VALUES (:id, :name, 1, :active, :inactive, :notes)"
                ),
                {"id": id_, "name": f"r{id_}", "active": active, "inactive": inactive, "notes": notes},
            )

    command.upgrade(alembic_config, "f88b533c9cdd")
    rows = "SELECT active_cook_time, typeof(active_cook_time), inactive_cook_time, notes FROM recipes ORDER BY id"
    with engine.connect() as connection:
        assert connection.execute(text(rows)).all() == [
            (20, "integer", 0, None),
            (75, "integer", 150, "Use ripe ones"),
            (180, "integer", None, "Chill well\nActive time: 2-3 hours\nInactive time: overnight"),
            (None, "null", None, None),
            (45, "integer", None, None),  # blank was never a time
            (None, "null", None, f"Active time: ²\nInactive time: {'9' * 400} minutes"),
        ]

    command.downgrade(alembic_config, "b4941c86400e")
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT active_cook_time, inactive_cook_time FROM recipes ORDER BY id")).all()
        assert rows[:2] == [("20 minutes", "0 minutes"), ("75 minutes", "150 minutes")]
        assert rows[4] == ("45 minutes", None)
    engine.dispose()


NAMED_TABLES = ("authors", "ingredients", "measurements", "preparations", "recipes", "tags")


def _insert_named_rows(connection, ingredients: str) -> None:
    connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
    connection.execute(text("INSERT INTO recipes (id, name, created_user_id) VALUES (1, 'Pie', 1)"))
    connection.execute(text(f"INSERT INTO ingredients (name) VALUES {ingredients}"))


def test_names_become_case_insensitive(alembic_config: Config):
    command.upgrade(alembic_config, "f88b533c9cdd")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        _insert_named_rows(connection, "('Egg'), ('flour')")

    command.upgrade(alembic_config, "fa0638d0971c")
    with engine.begin() as connection:
        assert connection.execute(text("SELECT name FROM ingredients ORDER BY id")).scalars().all() == ["Egg", "flour"]
        # Autogenerate can't see collations, so check the rebuilt tables directly.
        for table in NAMED_TABLES:
            sql = connection.execute(text("SELECT sql FROM sqlite_master WHERE name = :t"), {"t": table}).scalar_one()
            assert 'name VARCHAR COLLATE "NOCASE" NOT NULL' in sql, table
        with pytest.raises(IntegrityError):
            connection.execute(text("INSERT INTO recipes (name, created_user_id) VALUES ('PIE', 1)"))

    command.downgrade(alembic_config, "f88b533c9cdd")
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO ingredients (name) VALUES ('EGG')"))  # case-sensitive again
    engine.dispose()


def test_case_only_duplicates_stop_the_migration(alembic_config: Config):
    command.upgrade(alembic_config, "f88b533c9cdd")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        _insert_named_rows(connection, "('Egg'), ('egg'), ('flour')")

    with pytest.raises(RuntimeError, match="ingredients: Egg, egg"):
        command.upgrade(alembic_config, "fa0638d0971c")

    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == "f88b533c9cdd"
        assert connection.execute(text("SELECT count(*) FROM ingredients")).scalar() == 3
    engine.dispose()


def test_recipe_names_become_unique_per_cookbook(alembic_config: Config):
    command.upgrade(alembic_config, "fa0638d0971c")
    engine = create_engine(alembic_config.attributes["url"])
    insert = "INSERT INTO recipes (name, created_user_id, cookbook_id) VALUES ('{}', 1, {})"
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id, username, full_name, is_active, is_superuser) VALUES (1, 'u', 'U', 1, 0)"))
        connection.execute(text("INSERT INTO authors (id, name) VALUES (1, 'a')"))
        connection.execute(text("INSERT INTO cookbooks (id, name, author_id) VALUES (1, 'c1', 1), (2, 'c2', 1)"))
        connection.execute(text(insert.format("Pie", 1)))
        connection.execute(text(insert.format("Tart", "NULL")))

    command.upgrade(alembic_config, "46ca2fd01026")
    with engine.begin() as connection:
        assert connection.execute(text("SELECT name, cookbook_id FROM recipes ORDER BY id")).all() == [("Pie", 1), ("Tart", None)]
        connection.execute(text(insert.format("pie", 2)))
        connection.execute(text(insert.format("Pie", "NULL")))
    for name, cookbook in (("PIE", 1), ("tart", "NULL")):
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(insert.format(name, cookbook)))

    with engine.begin() as connection:
        connection.execute(text("DELETE FROM recipes WHERE id > 2"))
    command.downgrade(alembic_config, "fa0638d0971c")
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text(insert.format("PIE", 2)))  # unique app-wide again
    engine.dispose()


def _insert_cookbooks(connection, names: str) -> None:
    connection.execute(text("INSERT INTO authors (id, name) VALUES (1, 'Julia'), (2, 'Jacques')"))
    connection.execute(text(f"INSERT INTO cookbooks (name, author_id) VALUES {names}"))


def test_cookbook_names_become_unique_per_author(alembic_config: Config):
    command.upgrade(alembic_config, "08e03b8561b7")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        _insert_cookbooks(connection, "('Basics', 1), ('Basics', 2)")

    command.upgrade(alembic_config, "f8a75ac06317")
    with engine.begin() as connection:
        assert connection.execute(text("SELECT name, author_id FROM cookbooks ORDER BY id")).all() == [("Basics", 1), ("Basics", 2)]
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("INSERT INTO cookbooks (name, author_id) VALUES ('BASICS', 1)"))

    command.downgrade(alembic_config, "08e03b8561b7")
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO cookbooks (name, author_id) VALUES ('Basics', 1)"))
    engine.dispose()


def test_duplicate_cookbooks_stop_the_migration(alembic_config: Config):
    command.upgrade(alembic_config, "08e03b8561b7")
    engine = create_engine(alembic_config.attributes["url"])
    with engine.begin() as connection:
        _insert_cookbooks(connection, "('Basics', 1), ('basics', 1), ('Basics', 2)")

    with pytest.raises(RuntimeError, match="Julia: Basics, basics"):
        command.upgrade(alembic_config, "f8a75ac06317")

    with engine.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == "08e03b8561b7"
        assert connection.execute(text("SELECT count(*) FROM cookbooks")).scalar() == 3
    engine.dispose()
