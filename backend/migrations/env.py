from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.config import get_settings
from app.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    # Tests pass an explicit URL via config attributes; otherwise use app settings.
    return config.attributes.get("url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    try:
        _migrate(engine)
    finally:
        engine.dispose()


def _migrate(engine) -> None:
    with engine.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        if is_sqlite:
            # app.database turns foreign keys on for every connection. Batch mode
            # rebuilds tables by copy-drop-rename, and dropping a referenced table
            # with enforcement on fails or cascades, so turn it off here. pysqlite
            # hasn't begun a transaction yet, so the pragma takes effect.
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            # End the transaction SQLAlchemy auto-began for the pragma; otherwise
            # Alembic's begin_transaction() joins it and never commits, and the
            # alembic_version row is rolled back while the DDL stays.
            connection.commit()
        # render_as_batch: SQLite can't ALTER most things in place.
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        if is_sqlite:
            violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if violations:
                raise RuntimeError(f"migration left foreign key violations: {violations}")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
