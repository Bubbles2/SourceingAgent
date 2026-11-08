"""Run the Alembic migrations inside a transaction that is always rolled back.

Used by the tests and by ``validate-taxonomy --sandbox`` to prove the schema design against the
real PostgreSQL server without leaving anything behind: PostgreSQL DDL is transactional, so the
sandbox schema, its tables and any data loaded into it disappear at rollback.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, text

from auction_search.config import validate_identifier

SANDBOX_SCHEMA = "auction_search_sandbox"
PROJECT_ROOT = Path(__file__).resolve().parents[3]


def alembic_config(connection: Connection | None = None, app_schema: str | None = None) -> Config:
    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    if connection is not None:
        cfg.attributes["connection"] = connection
    if app_schema is not None:
        cfg.attributes["app_schema"] = app_schema
    return cfg


@contextmanager
def migrated_sandbox(engine: Engine, schema: str = SANDBOX_SCHEMA) -> Iterator[Connection]:
    """Yield a connection inside an open transaction where ``schema`` has been migrated to head.

    Everything is rolled back on exit, whatever happens inside the block.
    """
    validate_identifier(schema)
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            exists = conn.execute(text("select exists(select 1 from pg_namespace where nspname = :s)"),
                                  {"s": schema}).scalar()
            if exists:
                raise RuntimeError(f"schema {schema!r} already exists; the sandbox needs an unused schema name")
            command.upgrade(alembic_config(conn, schema), "head")
            yield conn
        finally:
            trans.rollback()
