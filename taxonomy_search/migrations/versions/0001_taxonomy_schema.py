"""Taxonomy schema: lookup tables, versions, concepts, terms, relationships, evidence,
source-category mappings and lot classifications.

Revision ID: 0001
Revises:
Create Date: 2026-11-07

Non-destructive: only creates objects inside the application schema (default ``auction_search``).
Nothing in ``drouot_collector`` is touched. Lookup values are copied from
``auction_search/taxonomy/vocabulary.py`` as it was at this revision (tests check they match).
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# ---- vocabulary at revision 0001 ---------------------------------------------------------

DIMENSIONS = [
    ("category", "Category", "Catégorie", "Top-level auction department, e.g. Furniture, Fine art, Fashion."),
    ("subcategory", "Subcategory", "Sous-catégorie",
     "Grouping inside a category, e.g. Footwear within Fashion, Seating within Furniture."),
    ("object_type", "Object type", "Type d'objet", "What the object is, e.g. ankle boots, commode, armchair."),
    ("period", "Historical period", "Époque", "When an object was made (dating). Carries start/end years."),
    ("style", "Style", "Style",
     "Stylistic idiom. An object can be in a style long after the period that created it."),
    ("region", "Country or region", "Pays ou région", "Place or culture of origin."),
    ("material", "Material", "Matériau", "What the object is made of."),
    ("technique", "Technique", "Technique", "How it was made or decorated, e.g. Boulle marquetry."),
    ("maker", "Maker, artist or brand", "Auteur, artiste ou marque",
     "Person, workshop, manufacture or brand; attributes.kind gives which."),
]

TERM_TYPES = [
    ("preferred", "The preferred label in that language (at most one per concept and language)."),
    ("synonym", "Another label with the same meaning in that language."),
    ("spelling_variant", "Alternative spelling or historical form, e.g. 'Buhl' for 'Boulle'."),
    ("abbreviation", "Abbreviation or acronym."),
    ("hidden", "Matched but never displayed, e.g. a frequent misspelling."),
]

RELATIONSHIP_TYPES = [
    ("broader", "has broader concept", "has narrower concept", True, False, True, 1.0,
     "Is-a / part-of hierarchy inside compatible dimensions (ankle boots → boots → footwear)."),
    ("related", "is related to", "is related to", False, True, False, 0.4,
     "Generic association. Stored once, with source id < target id."),
    ("originated_in_period", "originated in period", "period saw the origin of style", False, False, False, 0.7,
     "A style and the period that created it. NOT a synonym: later objects can share the style."),
    ("revival_of", "is a revival of", "was revived by", False, False, False, 0.5,
     "A later style reviving an earlier one (Napoleon III revival of Louis XIV)."),
    ("associated_technique", "is associated with technique", "is a technique associated with", False, False, False,
     0.5, "Technique characteristic of a style, period, object type or maker."),
    ("associated_material", "is associated with material", "is a material associated with", False, False, False,
     0.4, "Material characteristic of a style, technique, object type or maker."),
    ("named_after", "is named after", "gave its name to", False, False, False, 0.5,
     "A technique, style or object type named after a maker (Boulle marquetry → A.-C. Boulle)."),
    ("active_in_period", "was active in period", "period of activity of", False, False, False, 0.5,
     "A maker's period of activity."),
    ("associated_region", "is associated with region", "is a region associated with", False, False, False, 0.3,
     "Place or culture associated with a style, period, maker, etc."),
    ("characteristic_object", "is characteristic of object type", "is an object type typical of", False, False,
     False, 0.5, "Object types typical of a style, technique or maker (Louis Vuitton → luggage)."),
]

_ALL = tuple(d[0] for d in DIMENSIONS)
_CLASSIFICATION = ("category", "subcategory", "object_type")
_SAME = ("period", "style", "region", "material", "technique", "maker")
RULE_SPEC = {
    "broader": [
        (("category",), ("category",)),
        (("subcategory",), ("category", "subcategory")),
        (("object_type",), ("category", "subcategory", "object_type")),
        *[((d,), (d,)) for d in _SAME],
    ],
    "related": [(_ALL, _ALL)],
    "originated_in_period": [(("style",), ("period",))],
    "revival_of": [(("style",), ("style",))],
    "associated_technique": [
        (("style", "period", "region", "maker", "material", "category", "subcategory", "object_type"), ("technique",))
    ],
    "associated_material": [
        (("style", "period", "region", "maker", "technique", "category", "subcategory", "object_type"), ("material",))
    ],
    "named_after": [(("technique", "style", "material", "category", "subcategory", "object_type"), ("maker",))],
    "active_in_period": [(("maker",), ("period",))],
    "associated_region": [
        (("style", "period", "maker", "technique", "material", "category", "subcategory", "object_type"), ("region",))
    ],
    "characteristic_object": [(("style", "period", "region", "maker", "technique", "material"), _CLASSIFICATION)],
}

LOT_ASSERTIONS = {
    "classified_as": _CLASSIFICATION,
    "dated_to": ("period",),
    "in_style_of": ("style",),
    "made_by": ("maker",),
    "attributed_to": ("maker",),
    "workshop_of": ("maker",),
    "circle_of": ("maker",),
    "follower_of": ("maker",),
    "after": ("maker",),
    "made_of": ("material",),
    "uses_technique": ("technique",),
    "originates_from": ("region",),
    "mentions": _ALL,
}

REVIEW_CHECK = "review_status in ('candidate', 'approved', 'rejected')"
PROVENANCE_CHECK = (
    "provenance in ('seed', 'source_category', 'rule_extraction', 'ai_extraction', 'manual', 'search_feedback')"
)
RETIRED_CHECK = "retired_in_version_id is null or retired_in_version_id > introduced_in_version_id"
CONFIDENCE_CHECK = "confidence >= 0 and confidence <= 1"


def _common_checks(*, provenance: bool = True, retired: bool = True) -> list[sa.CheckConstraint]:
    checks = [sa.CheckConstraint(CONFIDENCE_CHECK, name="confidence_range"),
              sa.CheckConstraint(REVIEW_CHECK, name="review_status")]
    if provenance:
        checks.append(sa.CheckConstraint(PROVENANCE_CHECK, name="provenance"))
    if retired:
        checks.append(sa.CheckConstraint(RETIRED_CHECK, name="retired_after"))
    return checks


def _versioned_columns(s: str) -> list[sa.Column]:
    return [
        sa.Column("review_status", sa.Text(), nullable=False, server_default=sa.text("'candidate'")),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=False, server_default=sa.text("1")),
        sa.Column("provenance", sa.Text(), nullable=False),
        sa.Column("introduced_in_version_id", sa.Integer(), sa.ForeignKey(f"{s}.taxonomy_versions.id"), nullable=False),
        sa.Column("retired_in_version_id", sa.Integer(), sa.ForeignKey(f"{s}.taxonomy_versions.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def _concept_fk(s: str, id_col: str, dim_col: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [id_col, dim_col], [f"{s}.taxonomy_concepts.id", f"{s}.taxonomy_concepts.dimension"], onupdate="CASCADE"
    )


def _trgm_schema() -> str | None:
    """Schema where pg_trgm is installed, or None if it is not installed (index then skipped)."""
    if context.is_offline_mode():
        return "public"  # as found in Phase 1; the generated SQL can be edited before running it
    return op.get_bind().execute(
        sa.text("select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace "
                "where e.extname = 'pg_trgm'")
    ).scalar()


def upgrade(app_schema: str = "auction_search") -> None:
    s = app_schema

    # ---- lookup tables ------------------------------------------------------------------
    op.create_table(
        "taxonomy_dimensions",
        sa.Column("code", sa.Text(), primary_key=True),
        sa.Column("label_en", sa.Text(), nullable=False),
        sa.Column("label_fr", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        schema=s,
    )
    op.create_table(
        "taxonomy_term_types",
        sa.Column("code", sa.Text(), primary_key=True),
        sa.Column("description", sa.Text(), nullable=False),
        schema=s,
    )
    op.create_table(
        "taxonomy_relationship_types",
        sa.Column("code", sa.Text(), primary_key=True),
        sa.Column("label_en", sa.Text(), nullable=False),
        sa.Column("inverse_label_en", sa.Text(), nullable=False),
        sa.Column("is_hierarchical", sa.Boolean(), nullable=False),
        sa.Column("is_symmetric", sa.Boolean(), nullable=False),
        sa.Column("is_transitive", sa.Boolean(), nullable=False),
        sa.Column("expansion_weight", sa.Numeric(3, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        schema=s,
    )
    op.create_table(
        "taxonomy_relationship_rules",
        sa.Column("relationship_type", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_relationship_types.code"),
                  primary_key=True),
        sa.Column("source_dimension", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_dimensions.code"), primary_key=True),
        sa.Column("target_dimension", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_dimensions.code"), primary_key=True),
        schema=s,
    )
    op.create_table(
        "lot_assertion_rules",
        sa.Column("assertion", sa.Text(), primary_key=True),
        sa.Column("dimension", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_dimensions.code"), primary_key=True),
        schema=s,
    )

    # ---- versions -----------------------------------------------------------------------
    op.create_table(
        "taxonomy_versions",
        sa.Column("id", sa.Integer(), sa.Identity(always=True), primary_key=True),
        sa.Column("label", sa.Text(), nullable=False, unique=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("description", sa.Text()),
        sa.Column("parent_version_id", sa.Integer(), sa.ForeignKey(f"{s}.taxonomy_versions.id")),
        sa.Column("created_by", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('draft', 'published', 'retired')", name="status"),
        schema=s,
    )
    op.create_index("uq_taxonomy_versions_one_published", "taxonomy_versions", ["status"], unique=True,
                    schema=s, postgresql_where=sa.text("status = 'published'"))

    # ---- concepts -----------------------------------------------------------------------
    op.create_table(
        "taxonomy_concepts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("concept_key", sa.Text(), nullable=False, unique=True),
        sa.Column("dimension", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_dimensions.code"), nullable=False),
        sa.Column("start_year", sa.Integer()),
        sa.Column("end_year", sa.Integer()),
        sa.Column("scope_notes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_versioned_columns(s),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(r"concept_key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$'", name="concept_key_format"),
        sa.CheckConstraint("start_year is null or end_year is null or start_year <= end_year", name="year_order"),
        sa.CheckConstraint("jsonb_typeof(scope_notes) = 'object'", name="scope_notes_object"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="attributes_object"),
        *_common_checks(),
        sa.UniqueConstraint("id", "dimension"),
        schema=s,
    )
    op.create_index(op.f("ix_taxonomy_concepts_dimension"), "taxonomy_concepts", ["dimension"], schema=s)

    # ---- terms --------------------------------------------------------------------------
    op.create_table(
        "taxonomy_terms",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("concept_id", sa.BigInteger(), nullable=False),
        sa.Column("concept_dimension", sa.Text(), nullable=False),
        sa.Column("language", sa.Text(), nullable=False),
        sa.Column("term", sa.Text(), nullable=False),
        sa.Column("normalized", sa.Text(), nullable=False),
        sa.Column("term_type", sa.Text(), sa.ForeignKey(f"{s}.taxonomy_term_types.code"), nullable=False),
        sa.Column("is_ambiguous", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_versioned_columns(s),
        _concept_fk(s, "concept_id", "concept_dimension"),
        sa.CheckConstraint("language ~ '^[a-z]{2,3}$'", name="language_code"),
        sa.CheckConstraint("btrim(term) <> ''", name="term_not_blank"),
        sa.CheckConstraint("normalized <> ''", name="normalized_not_blank"),
        *_common_checks(),
        sa.UniqueConstraint("concept_id", "language", "normalized"),
        schema=s,
    )
    op.create_index(op.f("ix_taxonomy_terms_normalized"), "taxonomy_terms", ["normalized"], schema=s)
    op.create_index("uq_taxonomy_terms_one_preferred", "taxonomy_terms", ["concept_id", "language"], unique=True,
                    schema=s,
                    postgresql_where=sa.text("term_type = 'preferred' and retired_in_version_id is null"))
    op.create_index("uq_taxonomy_terms_preferred_label", "taxonomy_terms",
                    ["concept_dimension", "language", "normalized"], unique=True, schema=s,
                    postgresql_where=sa.text("term_type = 'preferred' and retired_in_version_id is null"))
    trgm = _trgm_schema()
    if trgm:
        op.create_index("ix_taxonomy_terms_normalized_trgm", "taxonomy_terms", ["normalized"], schema=s,
                        postgresql_using="gin", postgresql_ops={"normalized": f"{trgm}.gin_trgm_ops"})

    # ---- relationships ------------------------------------------------------------------
    op.create_table(
        "taxonomy_relationships",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("relationship_type", sa.Text(), nullable=False),
        sa.Column("source_concept_id", sa.BigInteger(), nullable=False),
        sa.Column("source_dimension", sa.Text(), nullable=False),
        sa.Column("target_concept_id", sa.BigInteger(), nullable=False),
        sa.Column("target_dimension", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text()),
        *_versioned_columns(s),
        _concept_fk(s, "source_concept_id", "source_dimension"),
        _concept_fk(s, "target_concept_id", "target_dimension"),
        sa.ForeignKeyConstraint(
            ["relationship_type", "source_dimension", "target_dimension"],
            [f"{s}.taxonomy_relationship_rules.relationship_type",
             f"{s}.taxonomy_relationship_rules.source_dimension",
             f"{s}.taxonomy_relationship_rules.target_dimension"],
        ),
        sa.CheckConstraint("source_concept_id <> target_concept_id", name="not_self"),
        sa.CheckConstraint("relationship_type <> 'related' or source_concept_id < target_concept_id",
                           name="related_canonical_order"),
        *_common_checks(),
        sa.UniqueConstraint("relationship_type", "source_concept_id", "target_concept_id"),
        schema=s,
    )
    op.create_index("ix_taxonomy_relationships_source", "taxonomy_relationships",
                    ["source_concept_id", "relationship_type"], schema=s)
    op.create_index("ix_taxonomy_relationships_target", "taxonomy_relationships",
                    ["target_concept_id", "relationship_type"], schema=s)

    # ---- evidence -----------------------------------------------------------------------
    op.create_table(
        "taxonomy_evidence",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("concept_id", sa.BigInteger(), sa.ForeignKey(f"{s}.taxonomy_concepts.id")),
        sa.Column("term_id", sa.BigInteger(), sa.ForeignKey(f"{s}.taxonomy_terms.id")),
        sa.Column("relationship_id", sa.BigInteger(), sa.ForeignKey(f"{s}.taxonomy_relationships.id")),
        sa.Column("lot_id", sa.BigInteger()),
        sa.Column("source", sa.Text()),
        sa.Column("source_lot_id", sa.Text()),
        sa.Column("source_field", sa.Text()),
        sa.Column("quote", sa.Text()),
        sa.Column("extractor", sa.Text(), nullable=False),
        sa.Column("extractor_version", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("num_nonnulls(concept_id, term_id, relationship_id) = 1", name="exactly_one_target"),
        schema=s,
    )
    for col in ("concept_id", "term_id", "relationship_id", "lot_id"):
        op.create_index(op.f(f"ix_taxonomy_evidence_{col}"), "taxonomy_evidence", [col], schema=s)

    # ---- source category mappings -------------------------------------------------------
    op.create_table(
        "source_category_mappings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("category_fr", sa.Text()),
        sa.Column("category_en", sa.Text()),
        sa.Column("concept_id", sa.BigInteger(), nullable=False),
        sa.Column("concept_dimension", sa.Text(), nullable=False),
        sa.Column("assertion", sa.Text(), nullable=False, server_default=sa.text("'classified_as'")),
        sa.Column("notes", sa.Text()),
        *_versioned_columns(s),
        _concept_fk(s, "concept_id", "concept_dimension"),
        sa.ForeignKeyConstraint(["assertion", "concept_dimension"],
                                [f"{s}.lot_assertion_rules.assertion", f"{s}.lot_assertion_rules.dimension"]),
        sa.CheckConstraint("num_nonnulls(category_fr, category_en) >= 1", name="has_category"),
        *_common_checks(),
        sa.UniqueConstraint("source", "category_fr", "category_en", "concept_id", "assertion",
                            postgresql_nulls_not_distinct=True),
        schema=s,
    )
    op.create_index(op.f("ix_source_category_mappings_concept_id"), "source_category_mappings", ["concept_id"],
                    schema=s)

    # ---- lot classifications (filled in Phase 4) ----------------------------------------
    op.create_table(
        "lot_concepts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("lot_id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_lot_id", sa.Text(), nullable=False),
        sa.Column("concept_id", sa.BigInteger(), nullable=False),
        sa.Column("concept_dimension", sa.Text(), nullable=False),
        sa.Column("assertion", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("source_field", sa.Text()),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("content_hash", sa.Text()),
        sa.Column("taxonomy_version_id", sa.Integer(), sa.ForeignKey(f"{s}.taxonomy_versions.id"), nullable=False),
        sa.Column("review_status", sa.Text(), nullable=False, server_default=sa.text("'candidate'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        _concept_fk(s, "concept_id", "concept_dimension"),
        sa.ForeignKeyConstraint(["assertion", "concept_dimension"],
                                [f"{s}.lot_assertion_rules.assertion", f"{s}.lot_assertion_rules.dimension"]),
        sa.CheckConstraint("method in ('rule', 'source_category', 'ai', 'manual')", name="method"),
        sa.CheckConstraint("jsonb_typeof(evidence) = 'object'", name="evidence_object"),
        *_common_checks(provenance=False, retired=False),
        sa.UniqueConstraint("lot_id", "concept_id", "assertion", "taxonomy_version_id"),
        schema=s,
    )
    op.create_index("ix_lot_concepts_source_lot", "lot_concepts", ["source", "source_lot_id"], schema=s)
    op.create_index("ix_lot_concepts_concept", "lot_concepts", ["concept_id", "assertion"], schema=s)

    # ---- lookup data --------------------------------------------------------------------
    def column_type(col: str) -> sa.types.TypeEngine:  # typed so offline (--sql) mode can render literals
        if col.startswith("is_"):
            return sa.Boolean()
        return sa.Numeric(3, 2) if col == "expansion_weight" else sa.Text()

    def table(name: str, *cols: str) -> sa.TableClause:
        return sa.table(name, *(sa.column(c, column_type(c)) for c in cols), schema=s)

    op.bulk_insert(table("taxonomy_dimensions", "code", "label_en", "label_fr", "description"),
                   [dict(zip(("code", "label_en", "label_fr", "description"), d)) for d in DIMENSIONS])
    op.bulk_insert(table("taxonomy_term_types", "code", "description"),
                   [{"code": c, "description": d} for c, d in TERM_TYPES])
    rt_cols = ("code", "label_en", "inverse_label_en", "is_hierarchical", "is_symmetric", "is_transitive",
               "expansion_weight", "description")
    op.bulk_insert(table("taxonomy_relationship_types", *rt_cols), [dict(zip(rt_cols, r)) for r in RELATIONSHIP_TYPES])
    rules = sorted({(rel, a, b) for rel, specs in RULE_SPEC.items() for srcs, tgts in specs for a in srcs for b in tgts})
    op.bulk_insert(table("taxonomy_relationship_rules", "relationship_type", "source_dimension", "target_dimension"),
                   [{"relationship_type": r, "source_dimension": a, "target_dimension": b} for r, a, b in rules])
    op.bulk_insert(table("lot_assertion_rules", "assertion", "dimension"),
                   [{"assertion": a, "dimension": d} for a, dims in LOT_ASSERTIONS.items() for d in dims])

    # ---- views over the published taxonomy version --------------------------------------
    visible = (
        "x.review_status = 'approved' and x.introduced_in_version_id <= v.id "
        "and (x.retired_in_version_id is null or x.retired_in_version_id > v.id)"
    )
    op.execute(f'create view "{s}".taxonomy_current_version as '
               f'select id, label, published_at from "{s}".taxonomy_versions where status = \'published\'')
    for view, base in (("published_concepts", "taxonomy_concepts"), ("published_terms", "taxonomy_terms"),
                       ("published_relationships", "taxonomy_relationships")):
        op.execute(f'create view "{s}".{view} as select x.* from "{s}".{base} x '
                   f'cross join "{s}".taxonomy_current_version v where {visible}')


def downgrade(app_schema: str = "auction_search") -> None:
    # Destructive: drops every taxonomy table and its data. Never run automatically.
    if os.environ.get("AUCTION_SEARCH_ALLOW_DESTRUCTIVE") != "1":
        raise RuntimeError("downgrade is destructive; set AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 to proceed")
    s = app_schema
    for view in ("published_relationships", "published_terms", "published_concepts", "taxonomy_current_version"):
        op.execute(f'drop view if exists "{s}".{view}')
    for name in ("lot_concepts", "source_category_mappings", "taxonomy_evidence", "taxonomy_relationships",
                 "taxonomy_terms", "taxonomy_concepts", "taxonomy_versions", "lot_assertion_rules",
                 "taxonomy_relationship_rules", "taxonomy_relationship_types", "taxonomy_term_types",
                 "taxonomy_dimensions"):
        op.drop_table(name, schema=s)
