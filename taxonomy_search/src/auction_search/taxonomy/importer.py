"""Import Phase 3 candidates into the taxonomy tables, with evidence (rules only, no AI).

* Candidates become concepts, terms and relationships with ``review_status = 'candidate'`` and
  ``provenance = 'rule_extraction'`` in a **draft** version (default ``0.2.0``). They are invisible to
  search until reviewed and published.
* Rows a reviewer has already approved or rejected are never overwritten; re-importing only refreshes
  extraction statistics on rows that are still candidates.
* Evidence (source lot, field, quote, extractor) is stored in ``taxonomy_evidence`` for new candidates
  and for existing concepts the extraction attested. Re-importing does not duplicate evidence.
* Existing concepts also get ``attributes.attestation`` (lots, auctions, ambiguous-only lots, top
  Drouot categories, English found in the data) so reviewers see how often they really occur.
* Relationships are only inserted when allowed by the relationship rules (also enforced by PostgreSQL).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from sqlalchemy import Connection, text
from sqlalchemy.exc import DBAPIError

from auction_search.enrichment.extraction import EXTRACTOR_VERSION
from auction_search.taxonomy.builder import BuildResult, Candidate, Evidence
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.store import TaxonomyStore
from auction_search.taxonomy.vocabulary import RELATIONSHIP_RULES, RELATIONSHIP_TYPES

log = logging.getLogger(__name__)

DEFAULT_VERSION = "0.2.0"
DEFAULT_MIN_CONFIDENCE = 0.4


@dataclass
class ImportResult:
    version_id: int
    version_label: str
    considered: int = 0
    below_min_confidence: int = 0
    concepts_inserted: int = 0
    concepts_refreshed: int = 0
    concepts_kept_reviewed: int = 0
    terms_inserted: int = 0
    relationships_inserted: int = 0
    evidence_inserted: int = 0
    attestations_recorded: int = 0  # existing concepts whose occurrence statistics were stored
    skipped: dict[str, int] = field(default_factory=dict)
    version_totals: dict[str, int] = field(default_factory=dict)  # what the version holds after this run

    def skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1


class CandidateImporter:
    def __init__(self, conn: Connection, schema: str) -> None:
        self.store = TaxonomyStore(conn, schema)
        self.conn = conn
        self.t = self.store._t

    def _ids(self) -> dict[str, tuple[int, str, str]]:
        return {k: (i, d, s) for k, i, d, s in self.conn.execute(text(
            f"select concept_key, id, dimension, review_status from {self.t('taxonomy_concepts')}"))}

    def _preferred_taken(self, dimension: str, language: str, label: str, own_id: int | None) -> bool:
        return bool(self.conn.execute(text(
            f"select exists(select 1 from {self.t('taxonomy_terms')} where concept_dimension = :d and language = :l "
            f"and normalized = :n and term_type = 'preferred' and retired_in_version_id is null "
            f"and concept_id is distinct from :own)"),
            {"d": dimension, "l": language, "n": normalize_term(label), "own": own_id}).scalar())

    def _upsert_concept(self, c: Candidate, vid: int, result: ImportResult) -> int | None:
        attributes = {"extraction": {"lots": c.lots, "auctions": c.auctions, "extractors": c.extractors,
                                     "top_categories": c.top_categories, "assertions": c.assertions,
                                     "en_source": c.en_source, "en_dice": c.en_dice,
                                     "broader_reason": c.broader_reason, "extractor_version": EXTRACTOR_VERSION}}
        row = self.conn.execute(text(
            f"insert into {self.t('taxonomy_concepts')} as tc (concept_key, dimension, start_year, end_year, "
            f"attributes, review_status, confidence, provenance, introduced_in_version_id) "
            f"values (:k, :d, :sy, :ey, cast(:a as jsonb), 'candidate', :conf, 'rule_extraction', :v) "
            f"on conflict (concept_key) do update set attributes = excluded.attributes, "
            f"confidence = excluded.confidence, updated_at = now() "
            f"where tc.review_status = 'candidate' and tc.provenance = 'rule_extraction' "
            f"returning id, (xmax = 0) as inserted"),
            {"k": c.key, "d": c.dimension, "sy": c.start_year, "ey": c.end_year,
             "a": json.dumps(attributes, ensure_ascii=False, default=str), "conf": c.confidence, "v": vid}).first()
        if row is None:  # exists and was reviewed (or is not ours): leave it alone
            result.concepts_kept_reviewed += 1
            return None
        if row.inserted:
            result.concepts_inserted += 1
        else:
            result.concepts_refreshed += 1
        return int(row.id)

    def _insert_term(self, concept_id: int, dimension: str, language: str, term: str, vid: int,
                     confidence: float, result: ImportResult) -> None:
        if self._preferred_taken(dimension, language, term, concept_id):
            result.skip(f"{language} label already preferred by another {dimension}")
            return
        n = self.conn.execute(text(
            f"insert into {self.t('taxonomy_terms')} (concept_id, concept_dimension, language, term, normalized, "
            f"term_type, review_status, confidence, provenance, introduced_in_version_id) "
            f"values (:c, :d, :l, :t, :n, 'preferred', 'candidate', :conf, 'rule_extraction', :v) "
            f"on conflict do nothing"),
            {"c": concept_id, "d": dimension, "l": language, "t": term, "n": normalize_term(term),
             "conf": confidence, "v": vid}).rowcount
        result.terms_inserted += n

    def _insert_relationship(self, rel_type: str, src: tuple[int, str], tgt: tuple[int, str], vid: int,
                             confidence: float, notes: str | None, result: ImportResult) -> None:
        if (rel_type, src[1], tgt[1]) not in RELATIONSHIP_RULES:
            result.skip(f"relationship {rel_type} {src[1]}→{tgt[1]} not allowed")
            return
        if RELATIONSHIP_TYPES[rel_type].is_symmetric and src[0] > tgt[0]:
            src, tgt = tgt, src
        result.relationships_inserted += self.conn.execute(text(
            f"insert into {self.t('taxonomy_relationships')} (relationship_type, source_concept_id, "
            f"source_dimension, target_concept_id, target_dimension, notes, review_status, confidence, provenance, "
            f"introduced_in_version_id) values (:r, :s, :sd, :t, :td, :notes, 'candidate', :conf, "
            f"'rule_extraction', :v) on conflict do nothing"),
            {"r": rel_type, "s": src[0], "sd": src[1], "t": tgt[0], "td": tgt[1], "notes": notes,
             "conf": confidence, "v": vid}).rowcount

    def _insert_evidence(self, concept_id: int, ev: Evidence, result: ImportResult) -> None:
        extractor = "gazetteer" if ev.extractor == "gazetteer" else f"rule:{ev.extractor}"
        result.evidence_inserted += self.conn.execute(text(
            f"insert into {self.t('taxonomy_evidence')} (concept_id, lot_id, source, source_lot_id, source_field, "
            f"quote, extractor, extractor_version) select :c, :lot, :src, :sid, :f, :q, :x, :xv "
            f"where not exists (select 1 from {self.t('taxonomy_evidence')} where concept_id = :c and lot_id = :lot "
            f"and extractor = :x and extractor_version = :xv)"),
            {"c": concept_id, "lot": ev.lot_id, "src": ev.source, "sid": ev.source_lot_id, "f": ev.field,
             "q": ev.quote[:500], "x": extractor, "xv": EXTRACTOR_VERSION}).rowcount

    def run(self, build: BuildResult, version_label: str = DEFAULT_VERSION,
            min_confidence: float = DEFAULT_MIN_CONFIDENCE) -> ImportResult:
        vid = self.store.get_or_create_version(version_label, "Phase 3 rule-based extraction candidates")
        result = ImportResult(vid, version_label)
        chosen = [c for c in build.candidates if c.confidence >= min_confidence]
        result.considered = len(build.candidates)
        result.below_min_confidence = len(build.candidates) - len(chosen)

        imported: dict[str, Candidate] = {}
        for c in chosen:
            savepoint = self.conn.begin_nested()
            try:
                cid = self._upsert_concept(c, vid, result)
                if cid is not None:
                    self._insert_term(cid, c.dimension, "fr", c.label_fr, vid, c.confidence, result)
                    if c.label_en:
                        self._insert_term(cid, c.dimension, "en", c.label_en, vid, c.confidence, result)
                    for ev in c.evidence:
                        self._insert_evidence(cid, ev, result)
                    imported[c.key] = c
                savepoint.commit()
            except DBAPIError as exc:
                savepoint.rollback()
                result.skip(f"concept rejected by database: {type(exc.orig).__name__}")
                log.warning("candidate not imported", extra={"key": c.key, "error": str(exc.orig).splitlines()[0]})

        ids = self._ids()
        for c in imported.values():
            src = ids.get(c.key)
            if src is None:
                continue
            links = ([("broader", c.broader, c.broader_reason)] if c.broader else []) + [
                (r, t, None) for r, t in c.relationships]
            for rel_type, target, notes in links:
                tgt = ids.get(target)
                if tgt is None:
                    result.skip("relationship target not imported (below confidence threshold)")
                    continue
                self._insert_relationship(rel_type, (src[0], src[1]), (tgt[0], tgt[1]), vid, c.confidence, notes,
                                          result)

        for a in build.attested:
            target = ids.get(a.concept_key)
            if target is not None:
                for ev in a.evidence:
                    self._insert_evidence(target[0], ev, result)
                # Measurements for reviewers (how often the concept occurs); never touches review status or labels.
                attestation = {"lots": a.lots, "auctions": a.auctions, "ambiguous_lots": a.ambiguous_lots,
                               "top_categories": a.top_categories[:3], "en_alignment": a.en_alignment,
                               "en_dice": a.en_dice, "extractor_version": EXTRACTOR_VERSION}
                result.attestations_recorded += self.conn.execute(text(
                    f"update {self.t('taxonomy_concepts')} set attributes = attributes || "
                    f"jsonb_build_object('attestation', cast(:a as jsonb)) where id = :id"),
                    {"a": json.dumps(attestation, ensure_ascii=False), "id": target[0]}).rowcount
        for table in ("taxonomy_concepts", "taxonomy_terms", "taxonomy_relationships"):
            result.version_totals[table] = int(self.conn.execute(text(
                f"select count(*) from {self.t(table)} where introduced_in_version_id = :v"), {"v": vid}).scalar_one())
        result.version_totals["taxonomy_evidence (all versions)"] = int(self.conn.execute(text(
            f"select count(*) from {self.t('taxonomy_evidence')}")).scalar_one())
        log.info("candidates imported", extra={"version": version_label, "inserted": result.concepts_inserted,
                                               "evidence": result.evidence_inserted})
        return result
