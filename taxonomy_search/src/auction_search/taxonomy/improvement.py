"""Continuous taxonomy improvement (Phase 10). Proposals only — nothing is approved or published.

``improve-taxonomy`` looks at what the system has learned since the taxonomy was built and writes
**candidate** rows into a new draft version (default ``0.3.0``) for the review workflow:

1. **Search demand** — words people searched that the taxonomy did not understand
   (``search_queries.unresolved_terms``). When such a word is the label of an existing *unreviewed*
   candidate (e.g. "art deco" → the extracted "Style Art Déco"), the candidate is marked with
   ``attributes.search_demand`` so reviewers see it first. Other frequent words are listed with the
   concepts their lots are classified under, for a human to decide (``search_feedback_suggestions.csv``);
   they are not turned into concepts automatically.
2. **Missing translations** — concepts in use without a French or English preferred label get a
   candidate label from French→English alignment over the bilingual lots (Dice ≥ 0.4).
3. **New relationships** — a style or period and a technique or material that occur together in many
   more lots than chance (≥ 3 lots, lift ≥ 3) get a candidate ``associated_technique`` /
   ``associated_material`` relationship.
4. **New terminology** — new or changed lots are extracted incrementally (cache) and new candidates are
   imported by the Phase 3 pipeline into the same draft version.
5. **Low-confidence classifications** — counts of lots flagged for review, by reason.

Search results from external providers are never used here: only the project's own lots and logs.
"""

from __future__ import annotations

import csv
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, text

from auction_search.enrichment.extraction import LotExtraction
from auction_search.enrichment.text import lemma
from auction_search.search.index import fold
from auction_search.taxonomy.builder import Aligner
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.snapshot import TaxonomySnapshot
from auction_search.taxonomy.store import TaxonomyStore
from auction_search.taxonomy.vocabulary import RELATIONSHIP_RULES

log = logging.getLogger(__name__)

DEFAULT_VERSION = "0.3.0"


@dataclass
class ImprovementResult:
    version_label: str
    version_id: int | None = None
    unresolved_terms: dict[str, int] = field(default_factory=dict)
    demand_marked: dict[str, str] = field(default_factory=dict)          # term -> candidate concept key
    suggestions: list[dict[str, Any]] = field(default_factory=list)      # for a human; no rows written
    translations_proposed: list[dict[str, Any]] = field(default_factory=list)
    relationships_proposed: list[dict[str, Any]] = field(default_factory=list)
    low_confidence: dict[str, int] = field(default_factory=dict)
    new_candidates_imported: int = 0
    dry_run: bool = False


class TaxonomyImprover:
    def __init__(self, conn: Connection, schema: str, snap: TaxonomySnapshot) -> None:
        self.conn, self.schema, self.snap = conn, schema, snap
        self.s = f'"{schema}"'
        self.store = TaxonomyStore(conn, schema)

    # ---- 1. search demand -------------------------------------------------------------

    def unresolved_terms(self, min_count: int = 1) -> Counter[str]:
        rows = self.conn.execute(text(f"select unnest(unresolved_terms) from {self.s}.search_queries")).all()
        counts = Counter(r[0] for r in rows)
        return Counter({k: v for k, v in counts.items() if v >= min_count})

    def search_demand(self, result: ImprovementResult, terms: Counter[str], dry_run: bool) -> None:
        candidates = self.conn.execute(text(
            f"select c.id, c.concept_key, t.normalized from {self.s}.taxonomy_terms t join {self.s}.taxonomy_concepts c "
            f"on c.id = t.concept_id where c.review_status = 'candidate' and c.provenance = 'rule_extraction'")).all()
        by_lemma: dict[str, list[tuple[int, str]]] = defaultdict(list)
        for cid, key, normalized in candidates:
            words = lemma(normalized).split()
            for size in (len(words), len(words) - 1):  # "style art deco" also answers "art deco"
                if size > 0:
                    by_lemma[" ".join(words[-size:])].append((cid, key))
        phrases = {f"{a} {b}": min(terms[a], terms[b])  # adjacent unresolved words, e.g. "art" + "deco"
                   for a, b in zip(list(terms), list(terms)[1:])}
        covered: set[str] = set()
        for term, count in [*phrases.items(), *terms.items()]:  # phrases first: "art deco" before "art"
            if term in covered:
                continue
            for cid, key in by_lemma.get(lemma(normalize_term(term)), [])[:1]:
                if " " in term:
                    covered |= set(term.split())
                result.demand_marked[term] = key
                if not dry_run:
                    self.conn.execute(text(
                        f"update {self.s}.taxonomy_concepts set attributes = attributes || jsonb_build_object("
                        f"'search_demand', coalesce((attributes->>'search_demand')::int, 0) + :n) where id = :id"),
                        {"n": count, "id": cid})
        for term, count in terms.items():
            if term in result.demand_marked:
                continue
            q = fold(term)
            lots = [r[0] for r in self.conn.execute(text(
                f"select lot_id from {self.s}.lot_search_documents where tsv_fr @@ plainto_tsquery('french', :q) "
                f"or tsv_en @@ plainto_tsquery('english', :q)"), {"q": q})]
            if len(lots) < 3:
                result.suggestions.append({"term": term, "searches": count, "lots": len(lots), "top_concepts": ""})
                continue
            top = self.conn.execute(text(
                f"select c.concept_key, count(distinct lc.lot_id) from {self.s}.lot_concepts lc join "
                f"{self.s}.taxonomy_concepts c on c.id = lc.concept_id where lc.lot_id = any(:ids) and lc.assertion <> "
                f"'mentions' group by 1 order by 2 desc limit 3"), {"ids": lots}).all()
            result.suggestions.append({"term": term, "searches": count, "lots": len(lots),
                                       "top_concepts": "; ".join(f"{k} {n / len(lots):.0%}" for k, n in top)})

    # ---- 2. translations ------------------------------------------------------------------

    def missing_translations(self, result: ImprovementResult, records: list[LotExtraction] | None) -> None:
        if not records:
            return
        lots_by_concept: dict[str, set[int]] = defaultdict(set)
        for lot_id, key in self.conn.execute(text(
                f"select lc.lot_id, c.concept_key from {self.s}.lot_concepts lc join {self.s}.taxonomy_concepts c "
                f"on c.id = lc.concept_id where lc.assertion <> 'mentions'")):
            lots_by_concept[key].add(lot_id)
        aligner = None
        for key, c in sorted(self.snap.concepts.items()):
            if "en" in c.labels or len(lots_by_concept.get(key, ())) < 3:
                continue
            aligner = aligner or Aligner(records, lead=True)
            found = aligner.best(lots_by_concept[key])
            if found and found[1] >= 0.4:
                result.translations_proposed.append({"concept": key, "language": "en", "term": found[0].capitalize(),
                                                     "dice": found[1], "lots": len(lots_by_concept[key])})

    # ---- 3. relationships -----------------------------------------------------------------

    def cooccurrence_relationships(self, result: ImprovementResult, min_lots: int = 3, min_lift: float = 3.0) -> None:
        rows = self.conn.execute(text(
            f"select lc.lot_id, c.concept_key, c.dimension from {self.s}.lot_concepts lc join {self.s}.taxonomy_concepts c "
            f"on c.id = lc.concept_id where lc.assertion <> 'mentions' and c.dimension in "
            f"('style', 'period', 'technique', 'material')")).all()
        by_lot: dict[int, set[str]] = defaultdict(set)
        dim: dict[str, str] = {}
        for lot_id, key, d in rows:
            by_lot[lot_id].add(key)
            dim[key] = d
        n = len(by_lot) or 1
        single: Counter[str] = Counter(k for keys in by_lot.values() for k in keys)
        pairs: Counter[tuple[str, str]] = Counter()
        for keys in by_lot.values():
            for a in keys:
                for b in keys:
                    if dim[a] in ("style", "period") and dim[b] in ("technique", "material"):
                        pairs[(a, b)] += 1
        existing = {(a, b) for _, a, b in self.snap.relationships} | {(b, a) for _, a, b in self.snap.relationships}
        for (a, b), together in pairs.most_common():
            if together < min_lots or (a, b) in existing:
                continue
            lift = together * n / (single[a] * single[b])
            rel = "associated_technique" if dim[b] == "technique" else "associated_material"
            if lift >= min_lift and (rel, dim[a], dim[b]) in RELATIONSHIP_RULES:
                result.relationships_proposed.append({"source": a, "type": rel, "target": b, "lots": together,
                                                      "lift": round(lift, 1)})

    # ---- 5. low confidence ----------------------------------------------------------------

    def low_confidence(self, result: ImprovementResult) -> None:
        result.low_confidence = dict(self.conn.execute(text(
            f"select split_part(split_part(r, ':', 1), ' (', 1), count(*) from {self.s}.lot_classification_state, "
            f"unnest(review_reasons) r group by 1 order by 2 desc")).all())
        result.low_confidence["assertions below 0.6 confidence"] = int(self.conn.execute(text(
            f"select count(*) from {self.s}.lot_concepts where confidence < 0.6 and assertion <> 'mentions'")).scalar_one())

    # ---- write proposals -------------------------------------------------------------------

    def write_proposals(self, result: ImprovementResult) -> None:
        vid = self.store.get_or_create_version(result.version_label, "Phase 10 improvement proposals")
        result.version_id = vid
        for p in result.translations_proposed:
            c = self.snap.concepts[p["concept"]]
            self.conn.execute(text(
                f"insert into {self.s}.taxonomy_terms (concept_id, concept_dimension, language, term, normalized, "
                f"term_type, review_status, confidence, provenance, introduced_in_version_id) select :c, :d, 'en', :t, :n, "
                f"'preferred', 'candidate', :conf, 'search_feedback', :v where not exists (select 1 from "
                f"{self.s}.taxonomy_terms where concept_dimension = :d and language = 'en' and normalized = :n "
                f"and term_type = 'preferred') on conflict do nothing"),
                {"c": c.id, "d": c.dimension, "t": p["term"], "n": normalize_term(p["term"]), "conf": min(1.0, p["dice"]),
                 "v": vid})
        for p in result.relationships_proposed:
            a, b = self.snap.concepts[p["source"]], self.snap.concepts[p["target"]]
            self.conn.execute(text(
                f"insert into {self.s}.taxonomy_relationships (relationship_type, source_concept_id, source_dimension, "
                f"target_concept_id, target_dimension, notes, review_status, confidence, provenance, "
                f"introduced_in_version_id) values (:r, :a, :ad, :b, :bd, :notes, 'candidate', :conf, 'search_feedback', "
                f":v) on conflict do nothing"),
                {"r": p["type"], "a": a.id, "ad": a.dimension, "b": b.id, "bd": b.dimension,
                 "notes": f"co-occurs in {p['lots']} lots, lift {p['lift']}", "conf": min(1.0, p["lift"] / 10), "v": vid})


def write_suggestions_csv(result: ImprovementResult, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=["term", "searches", "lots", "top_concepts", "decision", "notes"])
        writer.writeheader()
        for s in result.suggestions:
            writer.writerow(s | {"decision": "", "notes": ""})


def affected_lots(conn: Connection, schema: str, since: Any) -> set[int]:
    """Lots whose classification may change because concepts or terms changed after ``since``."""
    s = f'"{schema}"'
    changed = [r[0] for r in conn.execute(text(
        f"select id from {s}.taxonomy_concepts where updated_at > :t or created_at > :t union "
        f"select concept_id from {s}.taxonomy_terms where created_at > :t union "
        f"select source_concept_id from {s}.taxonomy_relationships where created_at > :t union "
        f"select target_concept_id from {s}.taxonomy_relationships where created_at > :t"), {"t": since})]
    if not changed:
        return set()
    lots = {r[0] for r in conn.execute(text(f"select distinct lot_id from {s}.lot_concepts where concept_id = any(:c)"),
                                       {"c": changed})}
    for (term,) in conn.execute(text(f"select distinct normalized from {s}.taxonomy_terms where concept_id = any(:c)"),
                                {"c": changed}):
        lots |= {r[0] for r in conn.execute(text(
            f"select lot_id from {s}.lot_search_documents where tsv_fr @@ phraseto_tsquery('french', :q) "
            f"or tsv_en @@ phraseto_tsquery('english', :q)"), {"q": term})}
    return lots
