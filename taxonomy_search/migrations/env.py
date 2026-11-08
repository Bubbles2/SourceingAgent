"""Alembic environment for the ``auction_search`` schema.

* The URL comes from ``auction_search.config.Settings`` (env vars / ``.env``), never from alembic.ini.
* All objects, including Alembic's own ``alembic_version`` table, live in the application schema
  (``APP_SCHEMA``, default ``auction_search``). The schema is created if missing.
* Refuses to run against the source schema (``DB_SCHEMA``) or system schemas.
* Programmatic callers (tests, ``validate-taxonomy --sandbox``) may pass an open connection in
  ``config.attributes["connection"]`` and another schema name in ``config.attributes["app_schema"]``.
  If that connection is already inside a transaction, Alembic does not commit, so the caller can
  roll everything back.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import Connection, create_engine, pool

from auction_search.config import get_settings, validate_identifier
from auction_search.database.models import APP_SCHEMA as MODEL_SCHEMA
from auction_search.database.models import Base

config = context.config
settings = get_settings()

APP_SCHEMA = validate_identifier(config.attributes.get("app_schema") or settings.app_schema)
_FORBIDDEN = {settings.db_schema, "public", "pg_catalog", "information_schema"}
if APP_SCHEMA in _FORBIDDEN or APP_SCHEMA.startswith("drouot_collector"):
    raise RuntimeError(f"refusing to run migrations in schema {APP_SCHEMA!r} (source or system schema)")


def _include_name(name: str | None, type_: str, parent_names: dict) -> bool:  # type: ignore[type-arg]
    # Autogenerate only looks at our own schema.
    if type_ == "schema":
        return name in (APP_SCHEMA, MODEL_SCHEMA)
    return True


def _configure_and_run(**configure_kwargs: object) -> None:
    context.configure(
        target_metadata=Base.metadata,
        version_table_schema=APP_SCHEMA,
        include_schemas=True,
        include_name=_include_name,
        transaction_per_migration=False,
        **configure_kwargs,  # type: ignore[arg-type]
    )
    with context.begin_transaction():
        context.execute(f'create schema if not exists "{APP_SCHEMA}"')
        context.run_migrations(app_schema=APP_SCHEMA)


def run_migrations_offline() -> None:
    """``alembic upgrade head --sql``: print the SQL; no database connection is made."""
    _configure_and_run(dialect_name="postgresql", literal_binds=True)


def run_migrations_online() -> None:
    connection: Connection | None = config.attributes.get("connection")
    if connection is not None:
        _configure_and_run(connection=connection)
        return
    engine = create_engine(
        settings.sqlalchemy_url(),
        poolclass=pool.NullPool,
        # Fail fast instead of queueing behind other sessions' locks.
        connect_args={"application_name": "auction_search_migrations", "options": "-c lock_timeout=10000"},
    )
    with engine.connect() as conn:
        _configure_and_run(connection=conn)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
