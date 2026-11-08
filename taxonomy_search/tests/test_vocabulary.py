"""The controlled vocabulary, and its copy inside migration 0001, must agree (no database needed)."""

import importlib.util
from pathlib import Path
from types import ModuleType

from auction_search.taxonomy import vocabulary as v

MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0001_taxonomy_schema.py"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migration_0001", MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_copies_the_vocabulary_exactly() -> None:
    m = _migration()
    assert [d[0] for d in m.DIMENSIONS] == list(v.DIMENSIONS)
    assert {d[0]: d[1:] for d in m.DIMENSIONS} == {
        d.code: (d.label_en, d.label_fr, d.description) for d in v.DIMENSIONS.values()}
    assert dict(m.TERM_TYPES) == v.TERM_TYPES
    assert {r[0]: r[1:] for r in m.RELATIONSHIP_TYPES} == {
        r.code: (r.label_en, r.inverse_label_en, r.is_hierarchical, r.is_symmetric, r.is_transitive,
                 r.expansion_weight, r.description) for r in v.RELATIONSHIP_TYPES.values()}
    rules = {(rel, a, b) for rel, specs in m.RULE_SPEC.items() for srcs, tgts in specs for a in srcs for b in tgts}
    assert rules == v.RELATIONSHIP_RULES
    assert {(a, d) for a, dims in m.LOT_ASSERTIONS.items() for d in dims} == v.LOT_ASSERTION_RULES


def test_period_and_style_are_never_hierarchically_linked() -> None:
    assert ("broader", "style", "period") not in v.RELATIONSHIP_RULES
    assert ("broader", "period", "style") not in v.RELATIONSHIP_RULES
    assert ("originated_in_period", "style", "period") in v.RELATIONSHIP_RULES


def test_dating_and_style_assertions_use_their_own_dimension() -> None:
    assert {d for a, d in v.LOT_ASSERTION_RULES if a == "dated_to"} == {"period"}
    assert {d for a, d in v.LOT_ASSERTION_RULES if a == "in_style_of"} == {"style"}


def test_every_relationship_type_has_rules_and_broader_is_the_only_hierarchy() -> None:
    assert {rel for rel, _, _ in v.RELATIONSHIP_RULES} == set(v.RELATIONSHIP_TYPES)
    assert [r.code for r in v.RELATIONSHIP_TYPES.values() if r.is_hierarchical] == ["broader"]
    assert [r.code for r in v.RELATIONSHIP_TYPES.values() if r.is_symmetric] == ["related"]
