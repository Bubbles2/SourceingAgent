"""An in-memory view of the taxonomy, shared by classification, search and query expansion.

Scope:

* ``published`` — only approved rows of the published version (the ``published_*`` views).
* ``draft`` — the working taxonomy before publication: hand-curated concepts (seed, manual, source
  category) that are not rejected, plus **machine-extracted concepts only once approved**. Unreviewed
  rule-extracted candidates are excluded: Phase 4 showed that many of them ("État", "Dimension",
  "Hauteur") would create false classifications.
* ``auto`` (default) — ``published`` when a version is published, otherwise ``draft``.

While nothing is published (the situation after Phase 3), ``auto`` resolves to ``draft``; every
consumer reports which scope it used so unreviewed results are never mistaken for reviewed ones.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import Connection, text

from auction_search.enrichment.extraction import Gazetteer
from auction_search.taxonomy.vocabulary import RELATIONSHIP_TYPES


@dataclass(frozen=True)
class ConceptInfo:
    id: int
    key: str
    dimension: str
    confidence: float
    review_status: str
    start_year: int | None
    end_year: int | None
    labels: dict[str, str]  # language -> preferred label


@dataclass(frozen=True)
class TermInfo:
    concept_key: str
    language: str
    term: str
    term_type: str
    ambiguous: bool


@dataclass
class TaxonomySnapshot:
    scope: str
    version_id: int | None
    concepts: dict[str, ConceptInfo]
    terms: list[TermInfo]
    relationships: list[tuple[str, str, str]]          # (type, source key, target key)
    category_map: dict[str, list[tuple[str, str, float]]]  # Drouot category_fr -> (key, assertion, confidence)
    fingerprint: str = ""
    gazetteer: Gazetteer = field(init=False)
    _children: dict[str, set[str]] = field(init=False, default_factory=dict)
    _parents: dict[str, set[str]] = field(init=False, default_factory=dict)

    def __post_init__(self) -> None:
        self.gazetteer = Gazetteer.from_rows(
            (t.concept_key, self.concepts[t.concept_key].dimension, t.language, t.term, t.term_type, t.ambiguous)
            for t in self.terms if t.concept_key in self.concepts)
        children: dict[str, set[str]] = defaultdict(set)
        parents: dict[str, set[str]] = defaultdict(set)
        for rel, a, b in self.relationships:
            if rel == "broader":
                children[b].add(a)
                parents[a].add(b)
        self._children, self._parents = dict(children), dict(parents)
        payload = "\n".join(sorted(f"c|{c.key}|{c.dimension}|{c.review_status}" for c in self.concepts.values()))
        payload += "\n".join(sorted(f"t|{t.concept_key}|{t.language}|{t.term}|{t.ambiguous}" for t in self.terms))
        payload += "\n".join(sorted(f"r|{r}|{a}|{b}" for r, a, b in self.relationships))
        self.fingerprint = f"{self.scope}:{hashlib.sha256(payload.encode()).hexdigest()[:16]}"

    # ---- graph helpers ----------------------------------------------------------

    def descendants(self, key: str) -> set[str]:
        out: set[str] = set()
        stack = [key]
        while stack:
            for child in self._children.get(stack.pop(), ()):
                if child not in out:
                    out.add(child)
                    stack.append(child)
        return out

    def ancestors(self, key: str) -> set[str]:
        out: set[str] = set()
        stack = [key]
        while stack:
            for parent in self._parents.get(stack.pop(), ()):
                if parent not in out:
                    out.add(parent)
                    stack.append(parent)
        return out

    def top_category(self, key: str) -> str | None:
        for k in (key, *self.ancestors(key)):
            if self.concepts.get(k) and self.concepts[k].dimension == "category":
                return k
        return None

    def associations(self, key: str) -> list[tuple[str, str, str]]:
        """Non-hierarchical links touching ``key``: (type, other key, 'out' | 'in')."""
        out = []
        for rel, a, b in self.relationships:
            if rel == "broader":
                continue
            if a == key:
                out.append((rel, b, "out"))
            elif b == key:
                out.append((rel, a, "in"))
        return out

    def weight(self, rel: str) -> float:
        return RELATIONSHIP_TYPES[rel].expansion_weight if rel in RELATIONSHIP_TYPES else 0.3

    def label(self, key: str, language: str = "en") -> str:
        c = self.concepts.get(key)
        if c is None:
            return key
        return c.labels.get(language) or c.labels.get("fr") or c.labels.get("en") or key

    def terms_of(self, key: str) -> list[TermInfo]:
        return [t for t in self.terms if t.concept_key == key]

    # ---- loading ----------------------------------------------------------------

    @classmethod
    def load(cls, conn: Connection, schema: str, scope: str = "auto") -> TaxonomySnapshot:
        t = lambda name: f'"{schema}".{name}'  # noqa: E731
        published_id = conn.execute(text(f"select id from {t('taxonomy_current_version')}")).scalar()
        if scope == "auto":
            scope = "published" if published_id is not None else "draft"
        if scope == "published":
            if published_id is None:
                raise LookupError("no published taxonomy version; review and publish one, or use scope 'draft'")
            concepts_src, terms_src, rels_src = t("published_concepts"), t("published_terms"), t("published_relationships")
            alive = "true"
            version_id: int | None = int(published_id)
        else:
            concepts_src, terms_src, rels_src = t("taxonomy_concepts"), t("taxonomy_terms"), t("taxonomy_relationships")
            alive = ("x.review_status <> 'rejected' and x.retired_in_version_id is null "
                     "and (x.provenance not in ('rule_extraction', 'ai_extraction', 'search_feedback') "
                     "or x.review_status = 'approved')")
            version_id = conn.execute(text(f"select max(id) from {t('taxonomy_versions')}")).scalar()

        labels: dict[str, dict[str, str]] = defaultdict(dict)
        terms: list[TermInfo] = []
        rows = conn.execute(text(
            f"select c.concept_key, x.language, x.term, x.term_type, x.is_ambiguous from {terms_src} x "
            f"join {t('taxonomy_concepts')} c on c.id = x.concept_id where {alive}")).all()
        for key, lang, term, ttype, amb in rows:
            terms.append(TermInfo(key, lang, term, ttype, bool(amb)))
            if ttype == "preferred":
                labels[key][lang] = term
        concepts = {
            r.concept_key: ConceptInfo(int(r.id), r.concept_key, r.dimension, float(r.confidence), r.review_status,
                                       r.start_year, r.end_year, dict(labels.get(r.concept_key, {})))
            for r in conn.execute(text(
                f"select x.id, x.concept_key, x.dimension, x.confidence, x.review_status, x.start_year, x.end_year "
                f"from {concepts_src} x where {alive}"))
        }
        relationships = [
            (r[0], r[1], r[2]) for r in conn.execute(text(
                f"select x.relationship_type, s.concept_key, g.concept_key from {rels_src} x "
                f"join {t('taxonomy_concepts')} s on s.id = x.source_concept_id "
                f"join {t('taxonomy_concepts')} g on g.id = x.target_concept_id where {alive}"))
            if r[1] in concepts and r[2] in concepts
        ]
        status_filter = "m.review_status = 'approved'" if scope == "published" else "m.review_status <> 'rejected'"
        category_map: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
        for cat, key, assertion, conf in conn.execute(text(
                f"select m.category_fr, c.concept_key, m.assertion, m.confidence from {t('source_category_mappings')} m "
                f"join {t('taxonomy_concepts')} c on c.id = m.concept_id where {status_filter}")):
            if cat and key in concepts:
                category_map[cat].append((key, assertion, float(conf)))
        terms = [x for x in terms if x.concept_key in concepts]
        return cls(scope, version_id, concepts, terms, relationships, dict(category_map))
