"""Reading and writing the taxonomy tables in ``auction_search`` (or another schema, e.g. a sandbox).

``TaxonomyStore`` wraps an open connection. Writes use SQLAlchemy Core upserts against the ORM
tables (with ``schema_translate_map`` when the schema is not ``auction_search``); reads that need
recursion use SQL with the schema name quoted explicitly.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Connection, func, literal_column, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auction_search.config import validate_identifier
from auction_search.database.models import (
    APP_SCHEMA,
    SourceCategoryMapping,
    TaxonomyConcept,
    TaxonomyRelationship,
    TaxonomyTerm,
    TaxonomyVersion,
)
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.seed import Issue, SeedTaxonomy, find_broader_cycles
from auction_search.taxonomy.vocabulary import RELATIONSHIP_TYPES, REQUIRED_LANGUAGES

log = logging.getLogger(__name__)

_concepts = TaxonomyConcept.__table__
_terms = TaxonomyTerm.__table__
_rels = TaxonomyRelationship.__table__
_maps = SourceCategoryMapping.__table__
_versions = TaxonomyVersion.__table__

_INSERTED = literal_column("(xmax = 0)").label("inserted")  # true for a fresh insert, false for an update


@dataclass
class LoadResult:
    version_id: int
    version_label: str
    inserted: Counter[str] = field(default_factory=Counter)
    updated: Counter[str] = field(default_factory=Counter)
    demoted_preferred_terms: int = 0


class TaxonomyStore:
    def __init__(self, conn: Connection, schema: str = APP_SCHEMA) -> None:
        self.schema = validate_identifier(schema)
        self.conn = conn
        if schema != APP_SCHEMA:
            conn.execution_options(schema_translate_map={APP_SCHEMA: schema})

    def _t(self, table: str) -> str:
        return f'"{self.schema}".{table}'

    def schema_ready(self) -> bool:
        """True if migration 0001 has been applied to this schema."""
        return bool(self.conn.execute(
            text("select to_regclass(:name) is not null"), {"name": f"{self.schema}.taxonomy_concepts"}
        ).scalar())

    # ---- versions -----------------------------------------------------------------

    def get_or_create_version(self, label: str, description: str | None = None, created_by: str | None = None) -> int:
        row = self.conn.execute(select(_versions.c.id, _versions.c.status).where(_versions.c.label == label)).first()
        if row is not None:
            if row.status != "draft":
                raise ValueError(f"taxonomy version {label!r} is {row.status}; only draft versions can be changed")
            return int(row.id)
        parent = self.conn.execute(select(_versions.c.id).where(_versions.c.status == "published")).scalar()
        return int(self.conn.execute(
            pg_insert(_versions).values(label=label, description=description, parent_version_id=parent,
                                        created_by=created_by).returning(_versions.c.id)
        ).scalar_one())

    def publish_version(self, label: str) -> None:
        """Retire the currently published version and publish ``label`` (Phase 3 adds the review UI)."""
        self.conn.execute(update(_versions).where(_versions.c.status == "published").values(status="retired"))
        self.conn.execute(update(_versions).where(_versions.c.label == label)
                          .values(status="published", published_at=func.now()))

    # ---- loading --------------------------------------------------------------------

    def load_seed(self, seed: SeedTaxonomy, *, review_status: str = "candidate", provenance: str = "seed",
                  created_by: str | None = None) -> LoadResult:
        """Upsert a validated seed into the given version (created as a draft if needed).

        Concepts, terms, relationships and mappings already in the database but absent from the
        seed are left untouched; retiring them is a reviewed change (Phase 10).
        """
        vid = self.get_or_create_version(seed.version, seed.description, created_by)
        result = LoadResult(vid, seed.version)
        ids: dict[str, int] = {}
        dims: dict[str, str] = {}

        for c in seed.concepts:
            stmt = pg_insert(_concepts).values(
                concept_key=c.key, dimension=c.dimension, start_year=c.start_year, end_year=c.end_year,
                scope_notes=c.scope_notes, attributes=c.attributes, review_status=review_status,
                confidence=1, provenance=provenance, introduced_in_version_id=vid,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[_concepts.c.concept_key],
                set_={k: stmt.excluded[k] for k in ("dimension", "start_year", "end_year", "scope_notes",
                                                     "attributes", "review_status")} | {"updated_at": func.now()},
            ).returning(_concepts.c.id, _INSERTED)
            row = self.conn.execute(stmt).one()
            ids[c.key], dims[c.key] = int(row.id), c.dimension
            (result.inserted if row.inserted else result.updated)["concepts"] += 1

        for c in seed.concepts:
            cid = ids[c.key]
            for lang in {t.language for t in c.terms if t.term_type == "preferred"}:
                wanted = next(t.normalized for t in c.terms if t.term_type == "preferred" and t.language == lang)
                # A changed preferred label: keep the old one as a synonym so the unique index holds.
                result.demoted_preferred_terms += self.conn.execute(
                    update(_terms).where(_terms.c.concept_id == cid, _terms.c.language == lang,
                                         _terms.c.term_type == "preferred", _terms.c.normalized != wanted)
                    .values(term_type="synonym")
                ).rowcount
            for t in c.terms:
                stmt = pg_insert(_terms).values(
                    concept_id=cid, concept_dimension=c.dimension, language=t.language, term=t.text,
                    normalized=t.normalized, term_type=t.term_type, is_ambiguous=t.ambiguous,
                    review_status=review_status, confidence=1, provenance=provenance, introduced_in_version_id=vid,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=[_terms.c.concept_id, _terms.c.language, _terms.c.normalized],
                    set_={k: stmt.excluded[k] for k in ("term", "term_type", "is_ambiguous", "review_status")},
                ).returning(_INSERTED)
                (result.inserted if self.conn.execute(stmt).scalar_one() else result.updated)["terms"] += 1

        for r in seed.relationships:
            src, tgt = r.source, r.target
            if RELATIONSHIP_TYPES[r.relationship_type].is_symmetric and ids[src] > ids[tgt]:
                src, tgt = tgt, src
            stmt = pg_insert(_rels).values(
                relationship_type=r.relationship_type, source_concept_id=ids[src], source_dimension=dims[src],
                target_concept_id=ids[tgt], target_dimension=dims[tgt], notes=r.notes,
                review_status=review_status, confidence=1, provenance=provenance, introduced_in_version_id=vid,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[_rels.c.relationship_type, _rels.c.source_concept_id, _rels.c.target_concept_id],
                set_={"notes": stmt.excluded.notes, "review_status": stmt.excluded.review_status},
            ).returning(_INSERTED)
            (result.inserted if self.conn.execute(stmt).scalar_one() else result.updated)["relationships"] += 1

        for m in seed.mappings:
            stmt = pg_insert(_maps).values(
                source="drouot", category_fr=m.category_fr, category_en=m.category_en, concept_id=ids[m.concept],
                concept_dimension=dims[m.concept], assertion=m.assertion, notes=m.notes,
                review_status=review_status, confidence=m.confidence, provenance="source_category",
                introduced_in_version_id=vid,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[_maps.c.source, _maps.c.category_fr, _maps.c.category_en, _maps.c.concept_id,
                                _maps.c.assertion],
                set_={k: stmt.excluded[k] for k in ("notes", "review_status", "confidence")},
            ).returning(_INSERTED)
            (result.inserted if self.conn.execute(stmt).scalar_one() else result.updated)["source_category_mappings"] += 1

        log.info("seed loaded", extra={"version": seed.version, "inserted": dict(result.inserted),
                                       "updated": dict(result.updated)})
        return result

    # ---- queries --------------------------------------------------------------------

    def concept_id(self, key: str) -> int | None:
        return self.conn.execute(select(_concepts.c.id).where(_concepts.c.concept_key == key)).scalar()

    def find_terms(self, term: str, language: str | None = None) -> list[dict[str, Any]]:
        """Concepts carrying ``term`` (after normalisation), optionally in one language."""
        sql = (f"select c.concept_key, c.dimension, t.language, t.term, t.term_type, t.is_ambiguous "
               f"from {self._t('taxonomy_terms')} t join {self._t('taxonomy_concepts')} c on c.id = t.concept_id "
               f"where t.normalized = :n and (cast(:lang as text) is null or t.language = :lang) "
               f"order by c.concept_key, t.language")
        return [dict(r._mapping) for r in self.conn.execute(text(sql), {"n": normalize_term(term), "lang": language})]

    def _walk(self, key: str, direction: str) -> list[str]:
        # direction "down": narrower concepts (descendants); "up": broader concepts (ancestors)
        start, step = ("target_concept_id", "source_concept_id") if direction == "down" else (
            "source_concept_id", "target_concept_id")
        sql = (
            f"with recursive walk(id, depth) as ("
            f" select r.{step}, 1 from {self._t('taxonomy_relationships')} r join {self._t('taxonomy_concepts')} c "
            f" on c.id = r.{start} where c.concept_key = :key and r.relationship_type = 'broader'"
            f" union select r.{step}, w.depth + 1 from {self._t('taxonomy_relationships')} r join walk w "
            f" on r.{start} = w.id where r.relationship_type = 'broader' and w.depth < 50)"
            f" select c.concept_key, min(w.depth) d from walk w join {self._t('taxonomy_concepts')} c on c.id = w.id"
            f" group by c.concept_key order by d, c.concept_key"
        )
        return [r[0] for r in self.conn.execute(text(sql), {"key": key})]

    def narrower(self, key: str) -> list[str]:
        """All concepts below ``key`` in the broader hierarchy (transitive)."""
        return self._walk(key, "down")

    def ancestors(self, key: str) -> list[str]:
        """All concepts above ``key`` (nearest first)."""
        return self._walk(key, "up")

    def relationships_between(self, key_a: str, key_b: str) -> list[str]:
        sql = (f"select r.relationship_type from {self._t('taxonomy_relationships')} r "
               f"join {self._t('taxonomy_concepts')} a on a.id = r.source_concept_id "
               f"join {self._t('taxonomy_concepts')} b on b.id = r.target_concept_id "
               f"where (a.concept_key = :a and b.concept_key = :b) or (a.concept_key = :b and b.concept_key = :a) "
               f"order by 1")
        return [r[0] for r in self.conn.execute(text(sql), {"a": key_a, "b": key_b})]

    def describe(self, key: str) -> dict[str, Any] | None:
        concept = self.conn.execute(
            text(f"select * from {self._t('taxonomy_concepts')} where concept_key = :k"), {"k": key}
        ).mappings().first()
        if concept is None:
            return None
        cid = concept["id"]
        terms = [dict(r._mapping) for r in self.conn.execute(text(
            f"select language, term, term_type, is_ambiguous, review_status from {self._t('taxonomy_terms')} "
            f"where concept_id = :id order by language, term_type <> 'preferred', term"), {"id": cid})]
        rel_sql = (f"select r.relationship_type, c.concept_key, c.dimension, r.review_status "
                   f"from {self._t('taxonomy_relationships')} r join {self._t('taxonomy_concepts')} c "
                   f"on c.id = r.{{other}} where r.{{this}} = :id order by 1, 2")
        outgoing = [dict(r._mapping) for r in self.conn.execute(
            text(rel_sql.format(other="target_concept_id", this="source_concept_id")), {"id": cid})]
        incoming = [dict(r._mapping) for r in self.conn.execute(
            text(rel_sql.format(other="source_concept_id", this="target_concept_id")), {"id": cid})]
        mappings = [dict(r._mapping) for r in self.conn.execute(text(
            f"select source, category_fr, category_en, assertion, confidence from "
            f"{self._t('source_category_mappings')} where concept_id = :id order by 2"), {"id": cid})]
        return {"concept": dict(concept), "terms": terms, "outgoing": outgoing, "incoming": incoming,
                "ancestors": self.ancestors(key), "narrower": self.narrower(key), "source_categories": mappings}

    def statistics(self) -> dict[str, Any]:
        def counts(sql: str) -> dict[str, int]:
            return {str(k): int(v) for k, v in self.conn.execute(text(sql))}

        return {
            "versions": [dict(r._mapping) for r in self.conn.execute(text(
                f"select label, status from {self._t('taxonomy_versions')} order by id"))],
            "concepts_by_dimension": counts(
                f"select dimension, count(*) from {self._t('taxonomy_concepts')} group by 1 order by 1"),
            "terms_by_language": counts(
                f"select language, count(*) from {self._t('taxonomy_terms')} group by 1 order by 1"),
            "terms_by_type": counts(
                f"select term_type, count(*) from {self._t('taxonomy_terms')} group by 1 order by 1"),
            "relationships_by_type": counts(
                f"select relationship_type, count(*) from {self._t('taxonomy_relationships')} group by 1 order by 1"),
            "source_category_mappings": int(self.conn.execute(
                text(f"select count(*) from {self._t('source_category_mappings')}")).scalar_one()),
            "published": {
                v: int(self.conn.execute(text(f"select count(*) from {self._t(v)}")).scalar_one())
                for v in ("published_concepts", "published_terms", "published_relationships")
            },
        }

    def validate(self) -> list[Issue]:
        """Checks the database cannot enforce with constraints."""
        issues: list[Issue] = []
        edges = [(str(a), str(b)) for a, b in self.conn.execute(text(
            f"select s.concept_key, t.concept_key from {self._t('taxonomy_relationships')} r "
            f"join {self._t('taxonomy_concepts')} s on s.id = r.source_concept_id "
            f"join {self._t('taxonomy_concepts')} t on t.id = r.target_concept_id "
            f"where r.relationship_type = 'broader' and r.retired_in_version_id is null"))]
        for cycle in find_broader_cycles(edges):
            issues.append(Issue("error", "cycle in broader hierarchy: " + " -> ".join(cycle)))
        # A missing label blocks approval/publication, but is normal for a fresh extraction candidate.
        for lang in REQUIRED_LANGUAGES:
            for key, status in self.conn.execute(text(
                f"select c.concept_key, c.review_status from {self._t('taxonomy_concepts')} c "
                f"where c.retired_in_version_id is null and c.review_status <> 'rejected' "
                f"and not exists (select 1 from {self._t('taxonomy_terms')} t where t.concept_id = c.id "
                f"and t.language = :lang and t.term_type = 'preferred' and t.retired_in_version_id is null) "
                f"order by 1"), {"lang": lang}):
                level = "error" if status == "approved" else "warning"
                issues.append(Issue(level, f"{key}: no preferred label in '{lang}'"))
        return issues
