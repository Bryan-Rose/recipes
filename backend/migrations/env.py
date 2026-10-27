from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, event

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
    if engine.dialect.name == "sqlite":
        _sqlite_transactions(engine)
    try:
        _migrate(engine)
    finally:
        engine.dispose()


def _sqlite_transactions(engine) -> None:
    # pysqlite runs DDL outside any transaction, so a migration that failed
    # partway would leave its earlier statements applied. SQLAlchemy's
    # documented recipe: take transaction control away from the driver and emit
    # BEGIN ourselves, so the whole upgrade commits or rolls back as one.
    @event.listens_for(engine, "connect")
    def _connect(dbapi_connection, _connection_record):
        dbapi_connection.isolation_level = None
        # app.database turns foreign keys on for every connection. Batch mode
        # rebuilds tables by copy-drop-rename, and dropping a referenced table
        # with enforcement on fails or cascades, so turn it off. The pragma is a
        # no-op inside a transaction, hence here rather than in _migrate.
        dbapi_connection.execute("PRAGMA foreign_keys=OFF")

    @event.listens_for(engine, "begin")
    def _begin(connection):
        connection.exec_driver_sql("BEGIN")


def _migrate(engine) -> None:
    with engine.connect() as connection:
        # render_as_batch: SQLite can't ALTER most things in place.
        # transactional_ddl: Alembic assumes SQLite can't roll back DDL and
        # commits after each revision; with _sqlite_transactions it can, so run
        # the whole upgrade, and the foreign key check, in one transaction.
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True, transactional_ddl=True)
        with context.begin_transaction():
            context.run_migrations()
            # Inside the transaction, so a violation rolls the upgrade back.
            if connection.dialect.name == "sqlite":
                violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
                if violations:
                    raise RuntimeError(f"migration left foreign key violations: {violations}")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
