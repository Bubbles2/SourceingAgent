"""Shared fixtures. Integration tests use the database configured in the environment / ``.env``
and are skipped automatically when it cannot be reached.

Taxonomy tests run in a sandbox: migrations are applied to schema ``auction_search_pytest`` inside a
transaction that is rolled back at the end of the module, and every test runs in a savepoint."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.exc import OperationalError

from auction_search.cli import DEFAULT_SEED
from auction_search.config import Settings
from auction_search.database.connection import create_readonly_engine, create_readwrite_engine
from auction_search.taxonomy.sandbox import migrated_sandbox
from auction_search.taxonomy.seed import load_seed_file
from auction_search.taxonomy.store import TaxonomyStore

PYTEST_SANDBOX = "auction_search_pytest"


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
def live_engine(settings: Settings) -> Engine:
    engine = create_readonly_engine(settings)
    try:
        with engine.connect():
            pass
    except OperationalError as exc:
        pytest.skip(f"database not reachable: {str(exc).splitlines()[0]}")
    return engine


@pytest.fixture(scope="module")
def sandbox_store(settings: Settings, live_engine: Engine) -> Iterator[TaxonomyStore]:
    """Migrated sandbox loaded with the example seed; rolled back after the module."""
    with migrated_sandbox(create_readwrite_engine(settings), PYTEST_SANDBOX) as conn:
        store = TaxonomyStore(conn, PYTEST_SANDBOX)
        store.load_seed(load_seed_file(DEFAULT_SEED))
        yield store


@pytest.fixture
def store(sandbox_store: TaxonomyStore) -> Iterator[TaxonomyStore]:
    """The sandbox store, with every change made by the test undone afterwards."""
    savepoint = sandbox_store.conn.begin_nested()
    yield sandbox_store
    savepoint.rollback()
