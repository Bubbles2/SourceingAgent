"""Lot embeddings (pgvector) with an HNSW cosine index.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-08

Non-destructive. Requires the pgvector extension, which Phase 1 found installed (schema ``public``);
the migration does not install extensions and stops with a clear message if it is missing.
Vector size 384 matches the chosen model (paraphrase-multilingual-MiniLM-L12-v2, see
reports/embedding_benchmark.md); a model with another size needs a new migration.
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import context, op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

DIMS = 384


def _vector_schema() -> str:
    if context.is_offline_mode():
        return "public"
    schema = op.get_bind().execute(sa.text(
        "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace "
        "where e.extname = 'vector'")).scalar()
    if schema is None:
        raise RuntimeError("the pgvector extension is not installed; ask a database administrator to run "
                           "'create extension vector' (this migration does not install extensions)")
    return schema


def upgrade(app_schema: str = "auction_search") -> None:
    s, v = app_schema, _vector_schema()
    op.execute(
        f'create table "{s}".lot_embeddings ('
        f" lot_id bigint not null,"  # drouot_collector.lots.id (no FK)
        f" model text not null,"
        f" source text not null,"
        f" source_lot_id text not null,"
        f" content_hash text not null,"
        f" embedding {v}.vector({DIMS}) not null,"
        f" created_at timestamp with time zone not null default now(),"
        f" constraint pk_lot_embeddings primary key (lot_id, model))"
    )
    op.execute(f'create index ix_lot_embeddings_hnsw on "{s}".lot_embeddings '
               f"using hnsw (embedding {v}.vector_cosine_ops)")


def downgrade(app_schema: str = "auction_search") -> None:
    if os.environ.get("AUCTION_SEARCH_ALLOW_DESTRUCTIVE") != "1":
        raise RuntimeError("downgrade is destructive; set AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 to proceed")
    op.execute(f'drop table "{app_schema}".lot_embeddings')
