"""Seed taxonomy files: parsing (YAML → dataclasses) and offline validation.

Validation needs no database. It applies the same rules PostgreSQL enforces (dimensions, allowed
relationship triples, one preferred label per language, unique preferred labels per dimension,
allowed assertion/dimension pairs) plus checks the database cannot express, such as cycles in the
``broader`` hierarchy. The file format is documented at the top of
``data/taxonomy/example_taxonomy.yaml`` and in docs/TAXONOMY.md.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.vocabulary import (
    CLASSIFICATION_DIMENSIONS,
    DIMENSIONS,
    LANGUAGE_PATTERN,
    LOT_ASSERTION_RULES,
    LOT_ASSERTIONS,
    RELATIONSHIP_RULES,
    RELATIONSHIP_TYPES,
    REQUIRED_LANGUAGES,
)

CONCEPT_KEY = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$")
_LANGUAGE = re.compile(LANGUAGE_PATTERN)
# Seed field name -> term_type
TERM_FIELDS = {"synonyms": "synonym", "spelling_variants": "spelling_variant",
               "abbreviations": "abbreviation", "hidden": "hidden"}
_CONCEPT_FIELDS = {"key", "dimension", "labels", "broader", "years", "note", "attributes", *TERM_FIELDS}


class SeedFormatError(ValueError):
    """The file does not have the expected structure."""


@dataclass(frozen=True)
class SeedTerm:
    language: str
    text: str
    term_type: str
    ambiguous: bool = False

    @property
    def normalized(self) -> str:
        return normalize_term(self.text)


@dataclass
class SeedConcept:
    key: str
    dimension: str
    terms: list[SeedTerm]
    start_year: int | None = None
    end_year: int | None = None
    scope_notes: dict[str, str] = field(default_factory=dict)
    attributes: dict[str, Any] = field(default_factory=dict)

    def preferred(self, language: str) -> str | None:
        return next((t.text for t in self.terms if t.language == language and t.term_type == "preferred"), None)


@dataclass(frozen=True)
class SeedRelationship:
    source: str
    relationship_type: str
    target: str
    notes: str | None = None


@dataclass(frozen=True)
class SeedMapping:
    category_fr: str | None
    category_en: str | None
    concept: str
    assertion: str
    confidence: float
    notes: str | None


@dataclass
class SeedTaxonomy:
    version: str
    description: str | None
    concepts: list[SeedConcept]
    relationships: list[SeedRelationship]
    mappings: list[SeedMapping]
    path: str | None = None

    def concept(self, key: str) -> SeedConcept | None:
        return next((c for c in self.concepts if c.key == key), None)


@dataclass(frozen=True)
class Issue:
    level: str  # "error" | "warning" | "info"
    message: str


# --------------------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------------------


def _term(language: str, value: Any, term_type: str, where: str) -> SeedTerm:
    if isinstance(value, str):
        return SeedTerm(language, value.strip(), term_type)
    if isinstance(value, dict) and isinstance(value.get("text"), str):
        unknown = set(value) - {"text", "ambiguous"}
        if unknown:
            raise SeedFormatError(f"{where}: unknown term field(s) {sorted(unknown)}")
        return SeedTerm(language, value["text"].strip(), term_type, bool(value.get("ambiguous", False)))
    raise SeedFormatError(f"{where}: a term must be a string or {{text: ..., ambiguous: ...}}, got {value!r}")


def _concept(raw: Any, index: int) -> tuple[SeedConcept, list[SeedRelationship]]:
    if not isinstance(raw, dict):
        raise SeedFormatError(f"concepts[{index}] must be a mapping")
    key = raw.get("key")
    where = f"concept {key or f'#{index}'}"
    if not isinstance(key, str) or not isinstance(raw.get("dimension"), str):
        raise SeedFormatError(f"{where}: 'key' and 'dimension' are required strings")
    unknown = set(raw) - _CONCEPT_FIELDS
    if unknown:
        raise SeedFormatError(f"{where}: unknown field(s) {sorted(unknown)}")

    labels = raw.get("labels") or {}
    if not isinstance(labels, dict):
        raise SeedFormatError(f"{where}: 'labels' must map language -> label")
    terms = [_term(str(lang), value, "preferred", where) for lang, value in labels.items()]
    for field_name, term_type in TERM_FIELDS.items():
        by_lang = raw.get(field_name) or {}
        if not isinstance(by_lang, dict):
            raise SeedFormatError(f"{where}: '{field_name}' must map language -> list of terms")
        for lang, values in by_lang.items():
            if not isinstance(values, list):
                raise SeedFormatError(f"{where}: '{field_name}.{lang}' must be a list")
            terms += [_term(str(lang), v, term_type, where) for v in values]

    years = raw.get("years")
    start = end = None
    if years is not None:
        if not (isinstance(years, list) and len(years) == 2 and all(y is None or isinstance(y, int) for y in years)):
            raise SeedFormatError(f"{where}: 'years' must be [start, end] with integers or null")
        start, end = years
    note = raw.get("note") or {}
    attributes = raw.get("attributes") or {}
    if not isinstance(note, dict) or not isinstance(attributes, dict):
        raise SeedFormatError(f"{where}: 'note' and 'attributes' must be mappings")
    broader = raw.get("broader") or []
    if not isinstance(broader, list):
        raise SeedFormatError(f"{where}: 'broader' must be a list of concept keys")

    concept = SeedConcept(key, raw["dimension"], terms, start, end,
                          {str(k): str(v).strip() for k, v in note.items()}, dict(attributes))
    return concept, [SeedRelationship(key, "broader", str(parent)) for parent in broader]


def parse_seed(data: Any, path: str | None = None) -> SeedTaxonomy:
    if not isinstance(data, dict) or "concepts" not in data:
        raise SeedFormatError("seed must be a mapping with a 'concepts' list")
    if not isinstance(data.get("version"), str):
        raise SeedFormatError("seed must have a string 'version'")

    concepts: list[SeedConcept] = []
    relationships: list[SeedRelationship] = []
    for i, raw in enumerate(data["concepts"] or []):
        concept, broader = _concept(raw, i)
        concepts.append(concept)
        relationships += broader

    for i, raw in enumerate(data.get("relationships") or []):
        if isinstance(raw, list) and len(raw) in (3, 4) and all(isinstance(x, str) for x in raw):
            relationships.append(SeedRelationship(raw[0], raw[1], raw[2], raw[3] if len(raw) == 4 else None))
        else:
            raise SeedFormatError(f"relationships[{i}] must be [source, type, target] (+ optional note)")

    mappings: list[SeedMapping] = []
    for i, raw in enumerate(data.get("source_categories") or []):
        if not isinstance(raw, dict) or not isinstance(raw.get("map"), list):
            raise SeedFormatError(f"source_categories[{i}] must be a mapping with a 'map' list")
        confidence = float(raw.get("confidence", 1.0))
        for target in raw["map"]:
            if isinstance(target, str):
                assertion, key = "classified_as", target
            elif isinstance(target, dict) and len(target) == 1:
                assertion, key = next(iter(target.items()))
            else:
                raise SeedFormatError(f"source_categories[{i}].map: use a key or {{assertion: key}}, got {target!r}")
            mappings.append(SeedMapping(raw.get("fr"), raw.get("en"), str(key), str(assertion), confidence,
                                        raw.get("note")))

    return SeedTaxonomy(data["version"], data.get("description"), concepts, relationships, mappings, path)


def load_seed_file(path: str | Path) -> SeedTaxonomy:
    with open(path, encoding="utf-8") as fh:
        return parse_seed(yaml.safe_load(fh), str(path))


# --------------------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------------------


def find_broader_cycles(edges: list[tuple[str, str]]) -> list[list[str]]:
    """Return cycles in a directed child -> parent graph (each cycle listed once)."""
    graph: dict[str, list[str]] = defaultdict(list)
    for child, parent in edges:
        graph[child].append(parent)
    cycles: list[list[str]] = []
    state: dict[str, int] = {}  # 1 = on stack, 2 = done
    stack: list[str] = []

    def visit(node: str) -> None:
        state[node] = 1
        stack.append(node)
        for parent in graph.get(node, []):
            if state.get(parent) == 1:
                cycles.append(stack[stack.index(parent):] + [parent])
            elif parent not in state:
                visit(parent)
        stack.pop()
        state[node] = 2

    for node in list(graph):
        if node not in state:
            visit(node)
    return cycles


def validate_seed(seed: SeedTaxonomy) -> list[Issue]:
    issues: list[Issue] = []

    def error(msg: str) -> None:
        issues.append(Issue("error", msg))

    def warn(msg: str) -> None:
        issues.append(Issue("warning", msg))

    by_key: dict[str, SeedConcept] = {}
    preferred_index: dict[tuple[str, str, str], str] = {}
    term_owners: dict[tuple[str, str], set[str]] = defaultdict(set)

    for c in seed.concepts:
        if not CONCEPT_KEY.match(c.key):
            error(f"{c.key}: invalid key (lower-case letters, digits, '_' separated by '.')")
        if c.key in by_key:
            error(f"{c.key}: duplicate concept key")
        by_key[c.key] = c
        if c.dimension not in DIMENSIONS:
            error(f"{c.key}: unknown dimension {c.dimension!r}")
        if c.start_year is not None and c.end_year is not None and c.start_year > c.end_year:
            error(f"{c.key}: start year {c.start_year} after end year {c.end_year}")
        for lang in REQUIRED_LANGUAGES:
            if c.preferred(lang) is None:
                error(f"{c.key}: missing preferred label in '{lang}'")
        seen: dict[tuple[str, str], SeedTerm] = {}
        for t in c.terms:
            if not _LANGUAGE.match(t.language):
                error(f"{c.key}: invalid language code {t.language!r}")
            if not t.text or not t.normalized:
                error(f"{c.key}: empty term in '{t.language}'")
                continue
            k = (t.language, t.normalized)
            if k in seen:
                error(f"{c.key}: '{t.text}' duplicates '{seen[k].text}' ({t.language}) after normalisation")
            seen[k] = t
            term_owners[k].add(c.key)
            if t.term_type == "preferred":
                pk = (c.dimension, t.language, t.normalized)
                if pk in preferred_index and preferred_index[pk] != c.key:
                    error(f"{c.key}: preferred label '{t.text}' ({t.language}) already used by "
                          f"{preferred_index[pk]} in dimension {c.dimension}")
                preferred_index[pk] = c.key

    seen_rel: set[tuple[str, str, str]] = set()
    broader_edges: list[tuple[str, str]] = []
    for r in seed.relationships:
        label = f"{r.source} -[{r.relationship_type}]-> {r.target}"
        src, tgt = by_key.get(r.source), by_key.get(r.target)
        if r.relationship_type not in RELATIONSHIP_TYPES:
            error(f"{label}: unknown relationship type")
            continue
        if src is None or tgt is None:
            error(f"{label}: unknown concept {r.source if src is None else r.target!r}")
            continue
        if r.source == r.target:
            error(f"{label}: a concept cannot relate to itself")
        if (r.relationship_type, src.dimension, tgt.dimension) not in RELATIONSHIP_RULES:
            error(f"{label}: '{r.relationship_type}' not allowed from {src.dimension} to {tgt.dimension}")
        canonical = (r.relationship_type, *sorted((r.source, r.target))) if RELATIONSHIP_TYPES[
            r.relationship_type].is_symmetric else (r.relationship_type, r.source, r.target)
        if canonical in seen_rel:
            error(f"{label}: duplicate relationship")
        seen_rel.add(canonical)  # type: ignore[arg-type]
        if r.relationship_type == "broader":
            broader_edges.append((r.source, r.target))

    for cycle in find_broader_cycles(broader_edges):
        error("cycle in broader hierarchy: " + " -> ".join(cycle))

    with_parent = {child for child, _ in broader_edges}
    for c in seed.concepts:
        if c.dimension in ("subcategory", "object_type") and c.key not in with_parent:
            warn(f"{c.key}: {c.dimension} without a broader concept (orphan in the classification tree)")

    seen_map: set[tuple[str | None, str | None, str, str]] = set()
    for m in seed.mappings:
        label = f"source category {m.category_fr!r}/{m.category_en!r} -> {m.concept}"
        concept = by_key.get(m.concept)
        if not (m.category_fr or m.category_en):
            error(f"{label}: needs fr and/or en category")
        if m.assertion not in LOT_ASSERTIONS:
            error(f"{label}: unknown assertion {m.assertion!r}")
        elif concept is None:
            error(f"{label}: unknown concept")
        elif (m.assertion, concept.dimension) not in LOT_ASSERTION_RULES:
            error(f"{label}: assertion '{m.assertion}' not allowed for dimension {concept.dimension}")
        if not 0 <= m.confidence <= 1:
            error(f"{label}: confidence must be between 0 and 1")
        key = (m.category_fr, m.category_en, m.concept, m.assertion)
        if key in seen_map:
            error(f"{label}: duplicate mapping")
        seen_map.add(key)

    for (lang, normalized), owners in sorted(term_owners.items()):
        if len(owners) > 1:
            issues.append(Issue("info", f"term '{normalized}' ({lang}) labels several concepts: {', '.join(sorted(owners))}"))
    return issues


def seed_statistics(seed: SeedTaxonomy) -> dict[str, Any]:
    by_dim: dict[str, int] = defaultdict(int)
    for c in seed.concepts:
        by_dim[c.dimension] += 1
    terms_by_type: dict[str, int] = defaultdict(int)
    terms_by_lang: dict[str, int] = defaultdict(int)
    for c in seed.concepts:
        for t in c.terms:
            terms_by_type[t.term_type] += 1
            terms_by_lang[t.language] += 1
    rel_by_type: dict[str, int] = defaultdict(int)
    for r in seed.relationships:
        rel_by_type[r.relationship_type] += 1
    return {
        "version": seed.version,
        "concepts": len(seed.concepts),
        "concepts_by_dimension": dict(sorted(by_dim.items(), key=lambda kv: list(DIMENSIONS).index(kv[0])
                                             if kv[0] in DIMENSIONS else 99)),
        "terms": sum(terms_by_type.values()),
        "terms_by_type": dict(terms_by_type),
        "terms_by_language": dict(terms_by_lang),
        "ambiguous_terms": sum(t.ambiguous for c in seed.concepts for t in c.terms),
        "relationships": len(seed.relationships),
        "relationships_by_type": dict(rel_by_type),
        "source_category_mappings": len(seed.mappings),
        "source_categories": len({(m.category_fr, m.category_en) for m in seed.mappings}),
        "classification_concepts": sum(1 for c in seed.concepts if c.dimension in CLASSIFICATION_DIMENSIONS),
    }
