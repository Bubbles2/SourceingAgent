"""Classification state, full-text search documents, query log and external search log.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-07

Non-destructive: creates four tables in the application schema. Nothing in ``drouot_collector``.
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade(app_schema: str = "auction_search") -> None:
    s = app_schema

    # Phase 4: one row per classified lot — what was classified, against which taxonomy, and why
    # it may need a human look. Used to reclassify only changed lots.
    op.create_table(
        "lot_classification_state",
        sa.Column("lot_id", sa.BigInteger(), primary_key=True),  # drouot_collector.lots.id (no FK)
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_lot_id", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("taxonomy_fingerprint", sa.Text(), nullable=False),
        sa.Column("taxonomy_scope", sa.Text(), nullable=False),
        sa.Column("classifier_version", sa.Text(), nullable=False),
        sa.Column("assertions", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("review_reasons", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("classified_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("taxonomy_scope in ('draft', 'published')", name="taxonomy_scope"),
        schema=s,
    )
    op.create_index("ix_lot_classification_state_needs_review", "lot_classification_state", ["needs_review"],
                    schema=s, postgresql_where=sa.text("needs_review"))

    # Phase 6: searchable copy of each lot (derived data; the source rows are never modified).
    op.create_table(
        "lot_search_documents",
        sa.Column("lot_id", sa.BigInteger(), primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_lot_id", sa.Text(), nullable=False),
        sa.Column("auction_key", sa.Text()),
        sa.Column("title_fr", sa.Text()),
        sa.Column("title_en", sa.Text()),
        sa.Column("lead_fr", sa.Text()),
        sa.Column("lead_en", sa.Text()),
        sa.Column("category_fr", sa.Text()),
        sa.Column("auction_date", sa.DateTime(timezone=True)),
        sa.Column("lot_url", sa.Text()),
        sa.Column("tsv_fr", postgresql.TSVECTOR()),
        sa.Column("tsv_en", postgresql.TSVECTOR()),
        sa.Column("content_hash", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=s,
    )
    op.create_index("ix_lot_search_documents_tsv_fr", "lot_search_documents", ["tsv_fr"], schema=s,
                    postgresql_using="gin")
    op.create_index("ix_lot_search_documents_tsv_en", "lot_search_documents", ["tsv_en"], schema=s,
                    postgresql_using="gin")

    # Phases 6, 9, 10: what people searched and how well it went.
    op.create_table(
        "search_queries",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("language", sa.Text()),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("concepts", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("unresolved_terms", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("results", sa.Integer(), nullable=False),
        sa.Column("direct_results", sa.Integer(), nullable=False),
        sa.Column("took_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=s,
    )
    op.create_index("ix_search_queries_created_at", "search_queries", ["created_at"], schema=s)

    # Phase 8: which expansions produced useful results at which provider.
    op.create_table(
        "external_search_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("expansion_term", sa.Text(), nullable=False),
        sa.Column("relationship", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("results", sa.Integer(), nullable=False),
        sa.Column("direct_matches", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=s,
    )
    op.create_index("ix_external_search_log_provider_term", "external_search_log", ["provider", "expansion_term"],
                    schema=s)


def downgrade(app_schema: str = "auction_search") -> None:
    if os.environ.get("AUCTION_SEARCH_ALLOW_DESTRUCTIVE") != "1":
        raise RuntimeError("downgrade is destructive; set AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 to proceed")
    for name in ("external_search_log", "search_queries", "lot_search_documents", "lot_classification_state"):
        op.drop_table(name, schema=app_schema)
