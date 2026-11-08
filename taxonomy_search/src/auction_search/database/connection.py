"""PostgreSQL engine factory.

Phase 1 programs only read data. ``create_readonly_engine`` makes every session start with
``default_transaction_read_only=on``, so PostgreSQL itself rejects INSERT/UPDATE/DELETE/DDL
even if a bug tried to issue one.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import Engine, create_engine, text

from auction_search.config import Settings

log = logging.getLogger(__name__)

APPLICATION_NAME = "auction_search"


@dataclass(frozen=True)
class ConnectionInfo:
    database: str
    current_user: str
    server_version: str
    transaction_read_only: str


def create_readonly_engine(settings: Settings) -> Engine:
    """Engine whose sessions are read-only and bounded by ``DB_STATEMENT_TIMEOUT_MS``."""
    options = (
        "-c default_transaction_read_only=on "
        f"-c statement_timeout={int(settings.db_statement_timeout_ms)}"
    )
    return create_engine(
        settings.sqlalchemy_url(),
        connect_args={"options": options, "connect_timeout": 10, "application_name": APPLICATION_NAME},
        pool_pre_ping=True,
        pool_size=2,
    )


def create_readwrite_engine(settings: Settings) -> Engine:
    """Engine for programs that write to the ``auction_search`` schema (Phase 2+).

    Never used to write to the source schema. ``lock_timeout`` makes DDL fail fast instead of
    queueing behind the collector's locks.
    """
    options = f"-c statement_timeout={int(settings.db_statement_timeout_ms)} -c lock_timeout=10000"
    return create_engine(
        settings.sqlalchemy_url(),
        connect_args={"options": options, "connect_timeout": 10, "application_name": APPLICATION_NAME},
        pool_pre_ping=True,
        pool_size=2,
    )


def check_connection(engine: Engine) -> ConnectionInfo:
    """Open a connection and return basic facts; raises ``sqlalchemy.exc.OperationalError`` on failure."""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "select current_database(), current_user, "
                "current_setting('server_version'), current_setting('transaction_read_only')"
            )
        ).one()
    info = ConnectionInfo(*row)
    log.info(
        "connected",
        extra={"database": info.database, "user": info.current_user, "server_version": info.server_version,
               "read_only": info.transaction_read_only},
    )
    return info
