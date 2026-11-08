"""SQLAlchemy ORM models for the ``auction_search`` schema (taxonomy and lot classification).

The tables are created by Alembic migration ``0001_taxonomy_schema`` — never by
``metadata.create_all``. ``tests/test_taxonomy_db.py`` compares these models with the migrated
database, so the two cannot drift apart silently.

Models are declared in schema ``auction_search``. To work in another schema (the sandbox used by
tests and ``validate-taxonomy --sandbox``), execute with
``execution_options(schema_translate_map={APP_SCHEMA: "<other>"})``.

Source lots are referenced by ``lot_id`` (= ``drouot_collector.lots.id``) plus the business key
``(source, source_lot_id)`` and deliberately have **no foreign key** into ``drouot_collector``,
so the collector can keep deleting or rewriting its own rows (decision recorded in PROGRESS.md).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    MetaData,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

APP_SCHEMA = "auction_search"

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(schema=APP_SCHEMA, naming_convention=NAMING_CONVENTION)


def _fk(table: str, column: str = "id") -> str:
    return f"{APP_SCHEMA}.{table}.{column}"


CONFIDENCE = Numeric(4, 3)


def _confidence_check() -> CheckConstraint:
    return CheckConstraint("confidence >= 0 and confidence <= 1", name="confidence_range")


def _review_check() -> CheckConstraint:
    return CheckConstraint("review_status in ('candidate', 'approved', 'rejected')", name="review_status")


def _provenance_check() -> CheckConstraint:
    return CheckConstraint(
        "provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')",
        name="provenance",
    )


def _retired_check() -> CheckConstraint:
    return CheckConstraint(
        "retired_in_version_id is null or retired_in_version_id > introduced_in_version_id", name="retired_after"
    )


# --------------------------------------------------------------------------------------
# Lookup tables (contents written by the migration; mirror of taxonomy/vocabulary.py)
# --------------------------------------------------------------------------------------


class TaxonomyDimension(Base):
    __tablename__ = "taxonomy_dimensions"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    label_en: Mapped[str] = mapped_column(Text)
    label_fr: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)


class TaxonomyTermType(Base):
    __tablename__ = "taxonomy_term_types"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[str] = mapped_column(Text)


class TaxonomyRelationshipType(Base):
    __tablename__ = "taxonomy_relationship_types"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    label_en: Mapped[str] = mapped_column(Text)
    inverse_label_en: Mapped[str] = mapped_column(Text)
    is_hierarchical: Mapped[bool] = mapped_column(Boolean)
    is_symmetric: Mapped[bool] = mapped_column(Boolean)
    is_transitive: Mapped[bool] = mapped_column(Boolean)
    expansion_weight: Mapped[Decimal] = mapped_column(Numeric(3, 2))
    description: Mapped[str] = mapped_column(Text)


class TaxonomyRelationshipRule(Base):
    """Allowed (relationship type, source dimension, target dimension) triples."""

    __tablename__ = "taxonomy_relationship_rules"

    relationship_type: Mapped[str] = mapped_column(
        Text, ForeignKey(_fk("taxonomy_relationship_types", "code")), primary_key=True
    )
    source_dimension: Mapped[str] = mapped_column(
        Text, ForeignKey(_fk("taxonomy_dimensions", "code")), primary_key=True
    )
    target_dimension: Mapped[str] = mapped_column(
        Text, ForeignKey(_fk("taxonomy_dimensions", "code")), primary_key=True
    )


class LotAssertionRule(Base):
    """Allowed (assertion, concept dimension) pairs for ``lot_concepts``."""

    __tablename__ = "lot_assertion_rules"

    assertion: Mapped[str] = mapped_column(Text, primary_key=True)
    dimension: Mapped[str] = mapped_column(Text, ForeignKey(_fk("taxonomy_dimensions", "code")), primary_key=True)


# --------------------------------------------------------------------------------------
# Versions
# --------------------------------------------------------------------------------------


class TaxonomyVersion(Base):
    __tablename__ = "taxonomy_versions"
    __table_args__ = (
        CheckConstraint("status in ('draft', 'published', 'retired')", name="status"),
        # At most one published version at any time.
        Index("uq_taxonomy_versions_one_published", "status", unique=True,
              postgresql_where=text("status = 'published'")),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    label: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    description: Mapped[str | None] = mapped_column(Text)
    parent_version_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    created_by: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# --------------------------------------------------------------------------------------
# Concepts, terms, relationships, evidence
# --------------------------------------------------------------------------------------


class TaxonomyConcept(Base):
    __tablename__ = "taxonomy_concepts"
    __table_args__ = (
        CheckConstraint(r"concept_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'", name="concept_key_format"),
        CheckConstraint("start_year is null or end_year is null or start_year <= end_year", name="year_order"),
        CheckConstraint("jsonb_typeof(scope_notes) = 'object'", name="scope_notes_object"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="attributes_object"),
        _confidence_check(),
        _review_check(),
        _provenance_check(),
        _retired_check(),
        # Target of the composite foreign keys that pin each reference to the concept's real dimension.
        UniqueConstraint("id", "dimension"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    concept_key: Mapped[str] = mapped_column(Text, unique=True)
    dimension: Mapped[str] = mapped_column(Text, ForeignKey(_fk("taxonomy_dimensions", "code")), index=True)
    start_year: Mapped[int | None] = mapped_column(Integer)
    end_year: Mapped[int | None] = mapped_column(Integer)
    scope_notes: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    review_status: Mapped[str] = mapped_column(Text, server_default=text("'candidate'"))
    confidence: Mapped[Decimal] = mapped_column(CONFIDENCE, server_default=text("1"))
    provenance: Mapped[str] = mapped_column(Text)
    introduced_in_version_id: Mapped[int] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    retired_in_version_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaxonomyTerm(Base):
    __tablename__ = "taxonomy_terms"
    __table_args__ = (
        ForeignKeyConstraint(
            ["concept_id", "concept_dimension"],
            [_fk("taxonomy_concepts", "id"), _fk("taxonomy_concepts", "dimension")],
            onupdate="CASCADE",
        ),
        CheckConstraint("language ~ '^[a-z]{2,3}$'", name="language_code"),
        CheckConstraint("btrim(term) <> ''", name="term_not_blank"),
        CheckConstraint("normalized <> ''", name="normalized_not_blank"),
        UniqueConstraint("concept_id", "language", "normalized"),
        Index("uq_taxonomy_terms_one_preferred", "concept_id", "language", unique=True,
              postgresql_where=text("term_type = 'preferred' and retired_in_version_id is null")),
        # No two concepts of the same dimension may share a preferred label in a language.
        Index("uq_taxonomy_terms_preferred_label", "concept_dimension", "language", "normalized", unique=True,
              postgresql_where=text("term_type = 'preferred' and retired_in_version_id is null")),
        Index("ix_taxonomy_terms_normalized_trgm", "normalized", postgresql_using="gin",
              postgresql_ops={"normalized": "public.gin_trgm_ops"}),
        _confidence_check(),
        _review_check(),
        _provenance_check(),
        _retired_check(),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    concept_id: Mapped[int] = mapped_column(BigInteger)
    concept_dimension: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(Text)
    term: Mapped[str] = mapped_column(Text)
    normalized: Mapped[str] = mapped_column(Text, index=True)
    term_type: Mapped[str] = mapped_column(Text, ForeignKey(_fk("taxonomy_term_types", "code")))
    is_ambiguous: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    review_status: Mapped[str] = mapped_column(Text, server_default=text("'candidate'"))
    confidence: Mapped[Decimal] = mapped_column(CONFIDENCE, server_default=text("1"))
    provenance: Mapped[str] = mapped_column(Text)
    introduced_in_version_id: Mapped[int] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    retired_in_version_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaxonomyRelationship(Base):
    __tablename__ = "taxonomy_relationships"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_concept_id", "source_dimension"],
            [_fk("taxonomy_concepts", "id"), _fk("taxonomy_concepts", "dimension")],
            onupdate="CASCADE",
        ),
        ForeignKeyConstraint(
            ["target_concept_id", "target_dimension"],
            [_fk("taxonomy_concepts", "id"), _fk("taxonomy_concepts", "dimension")],
            onupdate="CASCADE",
        ),
        # The (type, source dimension, target dimension) triple must be an allowed rule.
        ForeignKeyConstraint(
            ["relationship_type", "source_dimension", "target_dimension"],
            [
                _fk("taxonomy_relationship_rules", "relationship_type"),
                _fk("taxonomy_relationship_rules", "source_dimension"),
                _fk("taxonomy_relationship_rules", "target_dimension"),
            ],
        ),
        CheckConstraint("source_concept_id <> target_concept_id", name="not_self"),
        # Symmetric 'related' links are stored once, in a canonical direction.
        CheckConstraint("relationship_type <> 'related' or source_concept_id < target_concept_id",
                        name="related_canonical_order"),
        UniqueConstraint("relationship_type", "source_concept_id", "target_concept_id"),
        Index("ix_taxonomy_relationships_source", "source_concept_id", "relationship_type"),
        Index("ix_taxonomy_relationships_target", "target_concept_id", "relationship_type"),
        _confidence_check(),
        _review_check(),
        _provenance_check(),
        _retired_check(),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    relationship_type: Mapped[str] = mapped_column(Text)
    source_concept_id: Mapped[int] = mapped_column(BigInteger)
    source_dimension: Mapped[str] = mapped_column(Text)
    target_concept_id: Mapped[int] = mapped_column(BigInteger)
    target_dimension: Mapped[str] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(Text, server_default=text("'candidate'"))
    confidence: Mapped[Decimal] = mapped_column(CONFIDENCE, server_default=text("1"))
    provenance: Mapped[str] = mapped_column(Text)
    introduced_in_version_id: Mapped[int] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    retired_in_version_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaxonomyEvidence(Base):
    """Why a concept, term or relationship exists: source lots, quotes and the extractor that found them."""

    __tablename__ = "taxonomy_evidence"
    __table_args__ = (
        CheckConstraint("num_nonnulls(concept_id, term_id, relationship_id) = 1", name="exactly_one_target"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    concept_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_concepts")), index=True)
    term_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_terms")), index=True)
    relationship_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_relationships")), index=True)
    lot_id: Mapped[int | None] = mapped_column(BigInteger, index=True)  # drouot_collector.lots.id (no FK)
    source: Mapped[str | None] = mapped_column(Text)
    source_lot_id: Mapped[str | None] = mapped_column(Text)
    source_field: Mapped[str | None] = mapped_column(Text)
    quote: Mapped[str | None] = mapped_column(Text)
    extractor: Mapped[str] = mapped_column(Text)
    extractor_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SourceCategoryMapping(Base):
    """Maps a source's own category (e.g. Drouot 'Chaussures' / 'Shoes') to taxonomy concepts.

    One source category may map to several concepts on different dimensions, e.g. 'Marbres' →
    classified_as fine_art.sculpture.marble and made_of material.marble.
    """

    __tablename__ = "source_category_mappings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["concept_id", "concept_dimension"],
            [_fk("taxonomy_concepts", "id"), _fk("taxonomy_concepts", "dimension")],
            onupdate="CASCADE",
        ),
        ForeignKeyConstraint(
            ["assertion", "concept_dimension"],
            [_fk("lot_assertion_rules", "assertion"), _fk("lot_assertion_rules", "dimension")],
        ),
        CheckConstraint("num_nonnulls(category_fr, category_en) >= 1", name="has_category"),
        UniqueConstraint("source", "category_fr", "category_en", "concept_id", "assertion",
                         postgresql_nulls_not_distinct=True),
        _confidence_check(),
        _review_check(),
        _provenance_check(),
        _retired_check(),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    source: Mapped[str] = mapped_column(Text)
    category_fr: Mapped[str | None] = mapped_column(Text)
    category_en: Mapped[str | None] = mapped_column(Text)
    concept_id: Mapped[int] = mapped_column(BigInteger, index=True)
    concept_dimension: Mapped[str] = mapped_column(Text)
    assertion: Mapped[str] = mapped_column(Text, server_default=text("'classified_as'"))
    notes: Mapped[str | None] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(Text, server_default=text("'candidate'"))
    confidence: Mapped[Decimal] = mapped_column(CONFIDENCE, server_default=text("1"))
    provenance: Mapped[str] = mapped_column(Text)
    introduced_in_version_id: Mapped[int] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    retired_in_version_id: Mapped[int | None] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------------------
# Lot classification (filled in Phase 4)
# --------------------------------------------------------------------------------------


class LotConcept(Base):
    __tablename__ = "lot_concepts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["concept_id", "concept_dimension"],
            [_fk("taxonomy_concepts", "id"), _fk("taxonomy_concepts", "dimension")],
            onupdate="CASCADE",
        ),
        # e.g. 'dated_to' only with period concepts, 'in_style_of' only with style concepts.
        ForeignKeyConstraint(
            ["assertion", "concept_dimension"],
            [_fk("lot_assertion_rules", "assertion"), _fk("lot_assertion_rules", "dimension")],
        ),
        CheckConstraint("method in ('rule', 'source_category', 'ai', 'manual')", name="method"),
        CheckConstraint("jsonb_typeof(evidence) = 'object'", name="evidence_object"),
        UniqueConstraint("lot_id", "concept_id", "assertion", "taxonomy_version_id"),
        Index("ix_lot_concepts_source_lot", "source", "source_lot_id"),
        Index("ix_lot_concepts_concept", "concept_id", "assertion"),
        _confidence_check(),
        _review_check(),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    lot_id: Mapped[int] = mapped_column(BigInteger)  # drouot_collector.lots.id (no FK, by design)
    source: Mapped[str] = mapped_column(Text)
    source_lot_id: Mapped[str] = mapped_column(Text)
    concept_id: Mapped[int] = mapped_column(BigInteger)
    concept_dimension: Mapped[str] = mapped_column(Text)
    assertion: Mapped[str] = mapped_column(Text)
    confidence: Mapped[Decimal] = mapped_column(CONFIDENCE)
    method: Mapped[str] = mapped_column(Text)
    source_field: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    content_hash: Mapped[str | None] = mapped_column(Text)
    taxonomy_version_id: Mapped[int] = mapped_column(ForeignKey(_fk("taxonomy_versions")))
    review_status: Mapped[str] = mapped_column(Text, server_default=text("'candidate'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------------------
# Migration 0002: classification state, search documents, query and external search logs
# --------------------------------------------------------------------------------------


class LotClassificationState(Base):
    """Per lot: what was classified against which taxonomy, and whether a human should look (Phase 4)."""

    __tablename__ = "lot_classification_state"
    __table_args__ = (
        CheckConstraint("taxonomy_scope in ('draft', 'published')", name="taxonomy_scope"),
        Index("ix_lot_classification_state_needs_review", "needs_review", postgresql_where=text("needs_review")),
    )

    lot_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # drouot_collector.lots.id (no FK)
    source: Mapped[str] = mapped_column(Text)
    source_lot_id: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(Text)
    taxonomy_fingerprint: Mapped[str] = mapped_column(Text)
    taxonomy_scope: Mapped[str] = mapped_column(Text)
    classifier_version: Mapped[str] = mapped_column(Text)
    assertions: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    needs_review: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    review_reasons: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    classified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LotSearchDocument(Base):
    """Searchable copy of a lot for full-text search (Phase 6). Derived; source rows are untouched."""

    __tablename__ = "lot_search_documents"
    __table_args__ = (
        Index("ix_lot_search_documents_tsv_fr", "tsv_fr", postgresql_using="gin"),
        Index("ix_lot_search_documents_tsv_en", "tsv_en", postgresql_using="gin"),
    )

    lot_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source: Mapped[str] = mapped_column(Text)
    source_lot_id: Mapped[str] = mapped_column(Text)
    auction_key: Mapped[str | None] = mapped_column(Text)
    title_fr: Mapped[str | None] = mapped_column(Text)
    title_en: Mapped[str | None] = mapped_column(Text)
    lead_fr: Mapped[str | None] = mapped_column(Text)
    lead_en: Mapped[str | None] = mapped_column(Text)
    category_fr: Mapped[str | None] = mapped_column(Text)
    auction_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lot_url: Mapped[str | None] = mapped_column(Text)
    tsv_fr: Mapped[Any | None] = mapped_column(TSVECTOR)
    tsv_en: Mapped[Any | None] = mapped_column(TSVECTOR)
    content_hash: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SearchQuery(Base):
    __tablename__ = "search_queries"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(Text)
    concepts: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    unresolved_terms: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    results: Mapped[int] = mapped_column(Integer)
    direct_results: Mapped[int] = mapped_column(Integer)
    took_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ExternalSearchLog(Base):
    __tablename__ = "external_search_log"
    __table_args__ = (Index("ix_external_search_log_provider_term", "provider", "expansion_term"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    provider: Mapped[str] = mapped_column(Text)
    query: Mapped[str] = mapped_column(Text)
    expansion_term: Mapped[str] = mapped_column(Text)
    relationship: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer)
    results: Mapped[int] = mapped_column(Integer)
    direct_matches: Mapped[int] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# --------------------------------------------------------------------------------------
# Migration 0003: lot embeddings (pgvector)
# --------------------------------------------------------------------------------------

try:  # pgvector's SQLAlchemy type; optional so the rest of the package works without it
    from pgvector.sqlalchemy import Vector
except ImportError:  # pragma: no cover
    Vector = None  # type: ignore[assignment,misc]

EMBEDDING_DIMS = 384


class LotEmbedding(Base):
    """One vector per lot and model (Phase 5). Created by migration 0003 with an HNSW cosine index."""

    __tablename__ = "lot_embeddings"
    __table_args__ = (
        Index("ix_lot_embeddings_hnsw", "embedding", postgresql_using="hnsw",
              postgresql_ops={"embedding": "public.vector_cosine_ops"}),
    )

    lot_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    model: Mapped[str] = mapped_column(Text, primary_key=True)
    source: Mapped[str] = mapped_column(Text)
    source_lot_id: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(Text)
    embedding: Mapped[Any] = mapped_column(Vector(EMBEDDING_DIMS) if Vector else Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
