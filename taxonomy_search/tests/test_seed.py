"""Seed parsing and offline validation (no database)."""

from typing import Any

import pytest

from auction_search.cli import DEFAULT_SEED
from auction_search.taxonomy.seed import (
    SeedFormatError,
    find_broader_cycles,
    load_seed_file,
    parse_seed,
    seed_statistics,
    validate_seed,
)


def _concept(key: str, dimension: str, fr: str, en: str, **extra: Any) -> dict[str, Any]:
    return {"key": key, "dimension": dimension, "labels": {"fr": fr, "en": en}, **extra}


def _errors(data: dict[str, Any]) -> list[str]:
    return [i.message for i in validate_seed(parse_seed(data)) if i.level == "error"]


BASE = [
    _concept("fashion", "category", "Mode", "Fashion"),
    _concept("fashion.footwear", "subcategory", "Chaussures", "Footwear", broader=["fashion"]),
    _concept("style.louis_xiv", "style", "Style Louis XIV", "Louis XIV style"),
    _concept("period.louis_xiv", "period", "Époque Louis XIV", "Louis XIV period", years=[1643, 1715]),
]


def test_example_seed_is_valid() -> None:
    seed = load_seed_file(DEFAULT_SEED)
    issues = validate_seed(seed)
    assert [i.message for i in issues if i.level in ("error", "warning")] == []
    stats = seed_statistics(seed)
    assert stats["source_categories"] == 105  # every Drouot category found in Phase 1
    assert stats["concepts_by_dimension"]["category"] >= 6


def test_example_seed_contains_the_worked_examples() -> None:
    seed = load_seed_file(DEFAULT_SEED)
    keys = {c.key for c in seed.concepts}
    for key in ("fashion.footwear.boots", "fashion.footwear.ankle_boots", "fashion.footwear.pumps",
                "fashion.footwear.loafers", "fashion.footwear.sneakers", "fashion.footwear.sandals",
                "period.louis_xiv", "style.louis_xiv", "style.french_baroque", "technique.boulle_marquetry"):
        assert key in keys
    assert seed.concept("period.louis_xiv").start_year == 1643  # type: ignore[union-attr]
    assert seed.concept("fashion.footwear.ankle_boots").preferred("fr") == "Bottines"  # type: ignore[union-attr]


def test_minimal_valid_seed() -> None:
    assert _errors({"version": "t", "concepts": BASE,
                    "relationships": [["style.louis_xiv", "originated_in_period", "period.louis_xiv"]]}) == []


@pytest.mark.parametrize(
    ("concepts", "relationships", "expected"),
    [
        ([_concept("x", "colour", "Rouge", "Red")], [], "unknown dimension"),
        ([{"key": "x", "dimension": "material", "labels": {"fr": "Bois"}}], [], "missing preferred label in 'en'"),
        ([_concept("Bad Key", "material", "Bois", "Wood")], [], "invalid key"),
        ([_concept("x", "material", "Bois", "Wood", synonyms={"fr": ["BOIS"]})], [], "after normalisation"),
        ([_concept("a", "material", "Bois", "Wood"), _concept("b", "material", "Bois", "Timber")], [],
         "already used by a"),
        ([], [["style.louis_xiv", "broader", "period.louis_xiv"]], "'broader' not allowed from style to period"),
        ([], [["style.louis_xiv", "originated_in_period", "period.nowhere"]], "unknown concept"),
        ([], [["fashion", "broader", "fashion"]], "cannot relate to itself"),
        ([], [["fashion", "synonym_of", "fashion.footwear"]], "unknown relationship type"),
        ([_concept("p", "period", "P", "P", years=[1800, 1700])], [], "after end year"),
    ],
)
def test_validation_errors(concepts: list[dict[str, Any]], relationships: list[list[str]], expected: str) -> None:
    errors = _errors({"version": "t", "concepts": [*BASE, *concepts], "relationships": relationships})
    assert any(expected in e for e in errors), errors


def test_broader_cycle_detected() -> None:
    data = {"version": "t", "concepts": [
        _concept("a", "material", "A", "A", broader=["b"]),
        _concept("b", "material", "B", "B", broader=["a"]),
    ]}
    assert any("cycle" in e for e in _errors(data))
    assert find_broader_cycles([("x", "y"), ("y", "z")]) == []


def test_related_is_symmetric_for_duplicate_detection() -> None:
    data = {"version": "t", "concepts": BASE, "relationships": [
        ["fashion", "related", "style.louis_xiv"], ["style.louis_xiv", "related", "fashion"]]}
    assert any("duplicate relationship" in e for e in _errors(data))


def test_source_category_mapping_rules() -> None:
    data = {"version": "t", "concepts": BASE, "source_categories": [
        {"fr": "Chaussures", "en": "Shoes", "map": ["fashion.footwear"]},
        {"fr": "X", "en": "X", "map": [{"dated_to": "style.louis_xiv"}]},
        {"fr": "Y", "en": "Y", "map": ["missing.concept"]},
    ]}
    errors = _errors(data)
    assert any("'dated_to' not allowed for dimension style" in e for e in errors)
    assert any("unknown concept" in e for e in errors)
    assert len(errors) == 2


def test_ambiguous_terms_and_orphans() -> None:
    data = {"version": "t", "concepts": [
        *BASE,
        _concept("material.gold", "material", {"text": "Or", "ambiguous": True}, "Gold"),
        _concept("fashion.hats", "object_type", "Chapeaux", "Hats"),
    ]}
    seed = parse_seed(data)
    assert seed.concept("material.gold").terms[0].ambiguous  # type: ignore[union-attr]
    warnings = [i.message for i in validate_seed(seed) if i.level == "warning"]
    assert any("fashion.hats" in w and "orphan" in w for w in warnings)


@pytest.mark.parametrize(
    "data",
    [
        {"concepts": []},
        {"version": "t", "concepts": [{"key": "x"}]},
        {"version": "t", "concepts": [{**_concept("x", "material", "B", "W"), "colour": "red"}]},
        {"version": "t", "concepts": [_concept("x", "material", "B", "W", years=[1700])]},
        {"version": "t", "concepts": [], "relationships": [["a", "broader"]]},
        {"version": "t", "concepts": [], "source_categories": [{"fr": "A", "map": [{"a": "x", "b": "y"}]}]},
    ],
)
def test_format_errors(data: dict[str, Any]) -> None:
    with pytest.raises(SeedFormatError):
        parse_seed(data)
