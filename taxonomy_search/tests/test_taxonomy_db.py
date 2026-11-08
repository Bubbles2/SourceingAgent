"""Taxonomy schema against the real PostgreSQL server, inside a rolled-back sandbox.

Nothing here persists: see ``conftest.sandbox_store``.
"""

from __future__ import annotations

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, MetaData, text
from sqlalchemy.exc import IntegrityError

from auction_search.cli import DEFAULT_SEED
from auction_search.config import Settings
from auction_search.database.inspection import build_structure_report
from auction_search.database.models import Base
from auction_search.taxonomy import vocabulary as v
from auction_search.taxonomy.sandbox import alembic_config
from auction_search.taxonomy.scenarios import ScenarioRunner, find_example_lots
from auction_search.taxonomy.seed import load_seed_file
from auction_search.taxonomy.store import TaxonomyStore
from tests.conftest import PYTEST_SANDBOX

pytestmark = pytest.mark.integration


def test_lookup_tables_match_vocabulary(store: TaxonomyStore) -> None:
    q = store.conn.execute
    assert {r[0] for r in q(text(f"select code from {store._t('taxonomy_dimensions')}"))} == set(v.DIMENSIONS)
    assert {r[0] for r in q(text(f"select code from {store._t('taxonomy_term_types')}"))} == set(v.TERM_TYPES)
    assert {r[0] for r in q(text(f"select code from {store._t('taxonomy_relationship_types')}"))} == set(
        v.RELATIONSHIP_TYPES)
    rules = {tuple(r) for r in q(text(
        f"select relationship_type, source_dimension, target_dimension from {store._t('taxonomy_relationship_rules')}"))}
    assert rules == v.RELATIONSHIP_RULES
    assertions = {tuple(r) for r in q(text(f"select assertion, dimension from {store._t('lot_assertion_rules')}"))}
    assert assertions == v.LOT_ASSERTION_RULES


def test_orm_models_match_migrated_schema(store: TaxonomyStore) -> None:
    """Alembic autogenerate finds no difference between models.py and migration 0001."""
    target = MetaData(naming_convention=Base.metadata.naming_convention)
    for table in Base.metadata.sorted_tables:
        table.to_metadata(target, schema=PYTEST_SANDBOX)

    def include_name(name: str | None, type_: str, parent_names: dict) -> bool:  # type: ignore[type-arg]
        return name == PYTEST_SANDBOX if type_ == "schema" else name != "alembic_version"

    ctx = MigrationContext.configure(store.conn, opts={"include_schemas": True, "include_name": include_name,
                                                       "compare_type": True})
    assert compare_metadata(ctx, target) == []


def test_seed_load_is_idempotent(store: TaxonomyStore) -> None:
    result = store.load_seed(load_seed_file(DEFAULT_SEED))
    assert sum(result.inserted.values()) == 0
    assert result.updated["concepts"] == 176
    assert store.validate() == []


def test_changed_preferred_label_is_kept_as_synonym(store: TaxonomyStore) -> None:
    seed = load_seed_file(DEFAULT_SEED)
    boots = seed.concept("fashion.footwear.boots")
    assert boots is not None
    boots.terms = [t if not (t.term_type == "preferred" and t.language == "en")
                   else type(t)("en", "Riding boots", "preferred") for t in boots.terms]
    result = store.load_seed(seed)
    assert result.demoted_preferred_terms == 1
    en = {t["term"]: t["term_type"] for t in store.describe("fashion.footwear.boots")["terms"] if t["language"] == "en"}  # type: ignore[index]
    assert en == {"Riding boots": "preferred", "Boots": "synonym"}


def test_all_validation_scenarios_pass(store: TaxonomyStore, live_engine: Engine, settings: Settings) -> None:
    structure = build_structure_report(live_engine, settings.db_schema, settings.app_schema, "test")
    examples = find_example_lots(store, structure)
    results = ScenarioRunner(store, examples).run()
    failed = [(r.group, r.name, r.detail) for r in results if r.status == "failed"]
    assert failed == []
    assert sum(r.status == "passed" for r in results) >= 25


def test_lot_concepts_have_no_foreign_key_into_source_schema(store: TaxonomyStore) -> None:
    refs = store.conn.execute(text(
        "select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace "
        "join pg_class t on t.oid = c.confrelid join pg_namespace tn on tn.oid = t.relnamespace "
        "where c.contype = 'f' and n.nspname = :s and tn.nspname <> :s"), {"s": PYTEST_SANDBOX}).scalar()
    assert refs == 0


def test_published_version_is_unique(store: TaxonomyStore) -> None:
    store.publish_version("0.1.0")
    with pytest.raises(IntegrityError):
        with store.conn.begin_nested():
            store.conn.execute(text(f"insert into {store._t('taxonomy_versions')} (label, status) "
                                    f"values ('other', 'published')"))
    with pytest.raises(ValueError, match="only draft versions"):
        store.get_or_create_version("0.1.0")


def test_downgrade_requires_explicit_permission(store: TaxonomyStore, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg = alembic_config(store.conn, PYTEST_SANDBOX)
    monkeypatch.delenv("AUCTION_SEARCH_ALLOW_DESTRUCTIVE", raising=False)
    with store.conn.begin_nested():
        with pytest.raises(RuntimeError, match="destructive"):
            command.downgrade(cfg, "base")


def test_downgrade_works_when_permitted(store: TaxonomyStore, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUCTION_SEARCH_ALLOW_DESTRUCTIVE", "1")
    savepoint = store.conn.begin_nested()
    command.downgrade(alembic_config(store.conn, PYTEST_SANDBOX), "base")
    remaining = store.conn.execute(text(
        "select count(*) from information_schema.tables where table_schema = :s and table_name <> 'alembic_version'"),
        {"s": PYTEST_SANDBOX}).scalar()
    savepoint.rollback()  # restore the sandbox for the remaining tests
    assert remaining == 0
