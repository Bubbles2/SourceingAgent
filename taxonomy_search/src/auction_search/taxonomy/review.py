"""Human review of taxonomy candidates and publication of a version.

Workflow (see docs/TAXONOMY.md §7):

1. ``review-taxonomy list`` / ``export FILE.csv`` — candidates with labels, parent, support, an example quote.
2. A reviewer fills the ``decision`` column (``approve`` / ``reject``) and may correct ``label_fr`` /
   ``label_en``; ``review-taxonomy apply FILE.csv`` records the decisions. Single keys can also be
   approved or rejected directly.
3. ``publish-taxonomy VERSION`` refuses to publish while approved concepts lack approved FR/EN labels,
   approved relationships point at unapproved concepts, or the hierarchy has a cycle.

Approving a concept approves its candidate labels and every candidate relationship whose two ends are
then approved; rejecting a concept rejects its labels and all its relationships. Nothing is deleted.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, text

from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.seed import Issue
from auction_search.taxonomy.store import TaxonomyStore
from auction_search.taxonomy.vocabulary import REQUIRED_LANGUAGES

REVIEW_COLUMNS = ["decision", "concept_key", "dimension", "label_fr", "label_en", "broader", "confidence", "lots",
                  "auctions", "ambiguous_lots", "top_categories", "english_in_data", "provenance", "version", "status",
                  "example"]
DECISIONS = {
    **dict.fromkeys(("approve", "approved", "yes", "y", "oui", "o", "approuver", "approuve"), "approved"),
    **dict.fromkeys(("reject", "rejected", "no", "n", "non", "rejeter", "rejete"), "rejected"),
}


def _stat(key: str, cast: str = "int") -> str:
    """Statistic from the extraction (new candidates) or the attestation (existing concepts)."""
    return (f"coalesce((c.attributes->'extraction'->>'{key}')::{cast}, "
            f"(c.attributes->'attestation'->>'{key}')::{cast})")


def _read_csv(path: Path) -> list[dict[str, str]]:
    """Read a review file as written by us or re-saved by a spreadsheet (UTF-8 with or without BOM,
    or Windows-1252; comma or semicolon separated)."""
    raw = path.read_bytes()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw.decode("cp1252")
    header = content.split("\n", 1)[0]
    delimiter = ";" if header.count(";") > header.count(",") else ","
    return list(csv.DictReader(content.splitlines(), delimiter=delimiter))


@dataclass
class ReviewResult:
    approved: int = 0
    rejected: int = 0
    labels_changed: int = 0
    terms_updated: int = 0
    relationships_updated: int = 0
    unknown_keys: list[str] = field(default_factory=list)
    invalid_rows: list[str] = field(default_factory=list)


class Reviewer:
    def __init__(self, conn: Connection, schema: str) -> None:
        self.store = TaxonomyStore(conn, schema)
        self.conn = conn
        self.t = self.store._t

    def list(self, status: str | None = "candidate", dimension: str | None = None, provenance: str | None = None,
             version: str | None = None, min_confidence: float | None = None,
             limit: int | None = None) -> list[dict[str, Any]]:
        label = (f"(select term from {self.t('taxonomy_terms')} t where t.concept_id = c.id and t.language = '{{l}}' "
                 f"and t.term_type = 'preferred' and t.retired_in_version_id is null and t.review_status <> 'rejected' "
                 f"limit 1)")
        sql = (
            f"select c.concept_key, c.dimension, {label.format(l='fr')} as label_fr, {label.format(l='en')} as label_en, "
            f"(select string_agg(p.concept_key, ', ' order by p.concept_key) from {self.t('taxonomy_relationships')} r "
            f" join {self.t('taxonomy_concepts')} p on p.id = r.target_concept_id "
            f" where r.source_concept_id = c.id and r.relationship_type = 'broader' and r.review_status <> 'rejected') "
            f" as broader, c.confidence, "
            f"{_stat('lots')} as lots, {_stat('auctions')} as auctions, "
            f"(c.attributes->'attestation'->>'ambiguous_lots')::int as ambiguous_lots, "
            f"(select string_agg(x->>0 || ' (' || (x->>1) || ')', '; ') from jsonb_array_elements("
            f" coalesce(c.attributes->'extraction'->'top_categories', c.attributes->'attestation'->'top_categories', "
            f" '[]'::jsonb)) x) as top_categories, "
            f"coalesce(c.attributes->'attestation'->>'en_alignment', "
            f" case when c.attributes->'extraction'->>'en_source' is not null then "
            f" (c.attributes->'extraction'->>'en_source') || coalesce(' ' || (c.attributes->'extraction'->>'en_dice'), '') "
            f" end) as english_in_data, "
            f"c.provenance, v.label as version, c.review_status as status, "
            f"(select e.quote from {self.t('taxonomy_evidence')} e where e.concept_id = c.id order by e.id limit 1) "
            f" as example "
            f"from {self.t('taxonomy_concepts')} c join {self.t('taxonomy_versions')} v on v.id = c.introduced_in_version_id "
            f"where (cast(:status as text) is null or c.review_status = :status) "
            f"and (cast(:dim as text) is null or c.dimension = :dim) "
            f"and (cast(:prov as text) is null or c.provenance = :prov) "
            f"and (cast(:ver as text) is null or v.label = :ver) "
            f"and (cast(:minc as numeric) is null or c.confidence >= :minc) "
            f"order by c.confidence desc, lots desc nulls last, c.concept_key "
            f"limit :lim")
        rows = self.conn.execute(text(sql), {"status": status, "dim": dimension, "prov": provenance, "ver": version,
                                             "minc": min_confidence, "lim": limit or 1_000_000})
        return [{"decision": "", **dict(r._mapping)} for r in rows]

    @staticmethod
    def export_csv(rows: list[dict[str, Any]], path: Path, delimiter: str = ",") -> None:
        """UTF-8 with a BOM so spreadsheet programs show accents correctly."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.DictWriter(fh, fieldnames=REVIEW_COLUMNS, extrasaction="ignore", delimiter=delimiter)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    def _concept(self, key: str) -> tuple[int, str] | None:
        row = self.conn.execute(text(f"select id, dimension from {self.t('taxonomy_concepts')} where concept_key = :k"),
                                {"k": key}).first()
        return (int(row[0]), str(row[1])) if row else None

    def _set_label(self, concept_id: int, dimension: str, language: str, label: str, result: ReviewResult) -> None:
        label = label.strip()
        current = self.conn.execute(text(
            f"select id, term from {self.t('taxonomy_terms')} where concept_id = :c and language = :l "
            f"and term_type = 'preferred' and retired_in_version_id is null"), {"c": concept_id, "l": language}).first()
        if current and current.term == label:
            return
        if current:
            self.conn.execute(text(f"update {self.t('taxonomy_terms')} set term = :t, normalized = :n, "
                                   f"provenance = 'manual' where id = :id"),
                              {"t": label, "n": normalize_term(label), "id": current.id})
        else:
            self.conn.execute(text(
                f"insert into {self.t('taxonomy_terms')} (concept_id, concept_dimension, language, term, normalized, "
                f"term_type, review_status, provenance, introduced_in_version_id) select :c, :d, :l, :t, :n, "
                f"'preferred', 'candidate', 'manual', introduced_in_version_id from {self.t('taxonomy_concepts')} "
                f"where id = :c"),
                {"c": concept_id, "d": dimension, "l": language, "t": label, "n": normalize_term(label)})
        # A label change can change classifications: mark the concept as changed (see classify-lots --affected).
        self.conn.execute(text(f"update {self.t('taxonomy_concepts')} set updated_at = now() where id = :c"),
                          {"c": concept_id})
        result.labels_changed += 1

    def set_status(self, keys: list[str], decision: str, result: ReviewResult | None = None) -> ReviewResult:
        result = result or ReviewResult()
        status = DECISIONS[decision]
        for key in keys:
            concept = self._concept(key)
            if concept is None:
                result.unknown_keys.append(key)
                continue
            cid = concept[0]
            self.conn.execute(text(f"update {self.t('taxonomy_concepts')} set review_status = :s, updated_at = now() "
                                   f"where id = :c"), {"s": status, "c": cid})
            if status == "approved":
                result.approved += 1
                result.terms_updated += self.conn.execute(text(
                    f"update {self.t('taxonomy_terms')} set review_status = 'approved' "
                    f"where concept_id = :c and review_status = 'candidate'"), {"c": cid}).rowcount
                result.relationships_updated += self.conn.execute(text(
                    f"update {self.t('taxonomy_relationships')} r set review_status = 'approved' "
                    f"where r.review_status = 'candidate' and (r.source_concept_id = :c or r.target_concept_id = :c) "
                    f"and exists (select 1 from {self.t('taxonomy_concepts')} a where a.id = r.source_concept_id "
                    f"and a.review_status = 'approved') "
                    f"and exists (select 1 from {self.t('taxonomy_concepts')} b where b.id = r.target_concept_id "
                    f"and b.review_status = 'approved')"), {"c": cid}).rowcount
            else:
                result.rejected += 1
                result.terms_updated += self.conn.execute(text(
                    f"update {self.t('taxonomy_terms')} set review_status = 'rejected' where concept_id = :c"),
                    {"c": cid}).rowcount
                result.relationships_updated += self.conn.execute(text(
                    f"update {self.t('taxonomy_relationships')} set review_status = 'rejected' "
                    f"where source_concept_id = :c or target_concept_id = :c"), {"c": cid}).rowcount
        return result

    def apply_csv(self, path: Path) -> ReviewResult:
        rows = _read_csv(path)
        missing = {"decision", "concept_key"} - set(rows[0] if rows else {"decision", "concept_key"})
        if missing:
            raise ValueError(f"{path}: missing column(s) {sorted(missing)}")
        return self.apply_rows(rows, first_line=2)

    def apply_rows(self, rows: list[dict[str, str]], first_line: int = 1) -> ReviewResult:
        """Decisions as rows with ``decision``, ``concept_key`` and optional ``label_fr``/``label_en``
        (a review file's rows, or decisions from the admin page)."""
        result = ReviewResult()
        for n, row in enumerate(rows, start=first_line):
            decision = normalize_term(row.get("decision") or "")  # "Approuvé" → "approuve"
            if not decision:
                continue
            if decision not in DECISIONS:
                result.invalid_rows.append(f"line {n}: unknown decision {row.get('decision')!r} (use approve or reject)")
                continue
            key = (row.get("concept_key") or "").strip()
            concept = self._concept(key)
            if concept is None:
                result.unknown_keys.append(key)
                continue
            if DECISIONS[decision] == "approved":
                for lang in ("fr", "en"):
                    if (row.get(f"label_{lang}") or "").strip():
                        self._set_label(concept[0], concept[1], lang, row[f"label_{lang}"], result)
            self.set_status([key], decision, result)
        return result

    def publication_issues(self, label: str) -> list[Issue]:
        issues: list[Issue] = []
        status = self.conn.execute(text(f"select status from {self.t('taxonomy_versions')} where label = :l"),
                                   {"l": label}).scalar()
        if status is None:
            return [Issue("error", f"version {label!r} does not exist")]
        if status != "draft":
            issues.append(Issue("error", f"version {label!r} is {status}, not draft"))
        vid_filter = (f"c.introduced_in_version_id <= (select id from {self.t('taxonomy_versions')} where label = :l) "
                      f"and c.review_status = 'approved' and c.retired_in_version_id is null")
        for lang in REQUIRED_LANGUAGES:
            for (key,) in self.conn.execute(text(
                    f"select c.concept_key from {self.t('taxonomy_concepts')} c where {vid_filter} and not exists "
                    f"(select 1 from {self.t('taxonomy_terms')} t where t.concept_id = c.id and t.language = :lang "
                    f"and t.term_type = 'preferred' and t.review_status = 'approved' and t.retired_in_version_id is null)"
                    f" order by 1"), {"l": label, "lang": lang}):
                issues.append(Issue("error", f"{key}: approved without an approved '{lang}' preferred label"))
        for rel, a, b in self.conn.execute(text(
                f"select r.relationship_type, s.concept_key, t.concept_key from {self.t('taxonomy_relationships')} r "
                f"join {self.t('taxonomy_concepts')} s on s.id = r.source_concept_id "
                f"join {self.t('taxonomy_concepts')} t on t.id = r.target_concept_id "
                f"where r.review_status = 'approved' and (s.review_status <> 'approved' or t.review_status <> 'approved') "
                f"order by 2, 3")):
            issues.append(Issue("error", f"approved relationship {a} -[{rel}]-> {b} has an unapproved end"))
        issues += [i for i in self.store.validate() if i.level == "error"]
        return issues

    def publish(self, label: str) -> list[Issue]:
        issues = self.publication_issues(label)
        if not any(i.level == "error" for i in issues):
            self.store.publish_version(label)
        return issues
