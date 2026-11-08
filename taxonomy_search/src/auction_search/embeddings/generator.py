"""Embedding model wrapper, searchable text, and the incremental embedding job (Phase 5).

* Models run locally with sentence-transformers (Apple GPU "mps" when available, else CPU).
  The first use downloads the model from Hugging Face into the user's cache; nothing is sent out.
* Searchable text = French title + start of the French description + English title + start of the
  English description (fields in the wrong language skipped, HTML decoded, title prefix removed),
  plus the labels of **approved** lot assertions ("validated attributes") when there are any.
* Vectors are L2-normalised and stored in ``auction_search.lot_embeddings`` (pgvector), one row per
  lot and model. A lot is re-embedded only when its searchable text or the model changes.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Connection, Engine, text

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource, SourceLot
from auction_search.enrichment.text import clean, strip_title_prefix
from auction_search.text.language import detect_language

log = logging.getLogger(__name__)

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

LEAD_CHARS = 400


@dataclass(frozen=True)
class ModelSpec:
    name: str
    dims: int
    query_prefix: str = ""
    doc_prefix: str = ""


MODELS: dict[str, ModelSpec] = {m.name: m for m in (
    ModelSpec("intfloat/multilingual-e5-small", 384, "query: ", "passage: "),
    ModelSpec("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", 384),
)}


class Embedder:
    def __init__(self, model_name: str, device: str | None = None) -> None:
        import torch
        from sentence_transformers import SentenceTransformer

        if model_name not in MODELS:
            raise ValueError(f"unknown embedding model {model_name!r}; known: {sorted(MODELS)}")
        self.spec = MODELS[model_name]
        self.device = device or ("mps" if torch.backends.mps.is_available() else "cpu")
        t0 = time.perf_counter()
        self.model = SentenceTransformer(model_name, device=self.device)
        self.load_seconds = round(time.perf_counter() - t0, 2)
        log.info("embedding model loaded", extra={"model": model_name, "device": self.device,
                                                  "seconds": self.load_seconds})

    def encode_documents(self, texts: Sequence[str], batch_size: int = 64) -> Any:
        return self.model.encode([self.spec.doc_prefix + t for t in texts], batch_size=batch_size,
                                 normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)

    def encode_query(self, query: str) -> Any:
        return self.model.encode([self.spec.query_prefix + query], normalize_embeddings=True,
                                 convert_to_numpy=True, show_progress_bar=False)[0]


def lot_text(lot: SourceLot, languages: Sequence[str] = ("fr", "en"), extra_labels: Sequence[str] = ()) -> str:
    parts: list[str] = []
    for lang in languages:
        title = clean(lot.title.get(lang))
        lead = strip_title_prefix(clean(lot.description.get(lang)), title)[:LEAD_CHARS]
        for value in (title, lead):
            if value and detect_language(value) in (lang, "unknown"):
                parts.append(value)
    if extra_labels:
        parts.append(" ; ".join(extra_labels))
    return " \n".join(parts)


def text_hash(model: str, value: str) -> str:
    return hashlib.sha256(f"{model}\n{value}".encode()).hexdigest()


# --------------------------------------------------------------------------------------
# Job
# --------------------------------------------------------------------------------------


@dataclass
class EmbeddingStats:
    started_at: str
    model: str
    device: str
    dims: int
    lots_seen: int = 0
    unchanged_skipped: int = 0
    embedded: int = 0
    seconds_encoding: float = 0.0
    seconds_total: float = 0.0
    docs_per_second: float = 0.0
    model_load_seconds: float = 0.0
    table_bytes: int | None = None
    index_bytes: int | None = None
    dry_run: bool = False
    ai_tokens_used: int = 0
    notes: list[str] = field(default_factory=list)


def _approved_labels(conn: Connection, schema: str, lot_ids: list[int]) -> dict[int, list[str]]:
    rows = conn.execute(text(
        f'select lc.lot_id, coalesce(tf.term, te.term) from "{schema}".lot_concepts lc '
        f'left join "{schema}".taxonomy_terms tf on tf.concept_id = lc.concept_id and tf.language = \'fr\' '
        f"and tf.term_type = 'preferred' "
        f'left join "{schema}".taxonomy_terms te on te.concept_id = lc.concept_id and te.language = \'en\' '
        f"and te.term_type = 'preferred' "
        f"where lc.lot_id = any(:ids) and lc.review_status = 'approved' and lc.assertion <> 'mentions'"),
        {"ids": lot_ids}).all()
    out: dict[int, list[str]] = {}
    for lot_id, label in rows:
        if label:
            out.setdefault(lot_id, []).append(label)
    return out


def run_embeddings(engine: Engine, schema: str, structure: StructureReport, embedder: Embedder,
                   limit: int | None = None, batch_size: int = 256, force: bool = False,
                   dry_run: bool = False) -> EmbeddingStats:
    from pgvector.sqlalchemy import Vector  # noqa: F401  (registers the type with SQLAlchemy)

    model = embedder.spec.name
    stats = EmbeddingStats(datetime.now(timezone.utc).isoformat(timespec="seconds"), model, embedder.device,
                           embedder.spec.dims, dry_run=dry_run, model_load_seconds=embedder.load_seconds)
    t0 = time.perf_counter()
    source = LotSource(structure)
    with engine.connect() as read_conn:
        existing = {r[0]: r[1] for r in read_conn.execute(text(
            f'select lot_id, content_hash from "{schema}".lot_embeddings where model = :m'), {"m": model})}
        for batch in source.iter_batches(read_conn, batch_size=batch_size, limit=limit):
            labels = _approved_labels(read_conn, schema, [lot.lot_id for lot in batch])
            todo: list[tuple[SourceLot, str, str]] = []
            for lot in batch:
                stats.lots_seen += 1
                body = lot_text(lot, extra_labels=labels.get(lot.lot_id, ()))
                h = text_hash(model, body)
                if not force and existing.get(lot.lot_id) == h:
                    stats.unchanged_skipped += 1
                    continue
                todo.append((lot, body, h))
            if not todo:
                continue
            t1 = time.perf_counter()
            vectors = embedder.encode_documents([b for _, b, _ in todo])
            stats.seconds_encoding += time.perf_counter() - t1
            stats.embedded += len(todo)
            if dry_run:
                continue
            with engine.begin() as conn:
                conn.execute(text(
                    f'insert into "{schema}".lot_embeddings (lot_id, model, source, source_lot_id, content_hash, '
                    f"embedding) values (:lot, :m, :src, :sid, :h, cast(:v as public.vector)) "
                    f"on conflict (lot_id, model) do update set content_hash = excluded.content_hash, "
                    f"embedding = excluded.embedding, created_at = now()"),
                    [{"lot": lot.lot_id, "m": model, "src": lot.source, "sid": lot.source_lot_id, "h": h,
                      "v": "[" + ",".join(f"{x:.6f}" for x in vec) + "]"} for (lot, _, h), vec in zip(todo, vectors)])
            log.info("batch embedded", extra={"last_lot_id": batch[-1].lot_id, "embedded": stats.embedded})
    stats.seconds_encoding = round(stats.seconds_encoding, 2)
    stats.seconds_total = round(time.perf_counter() - t0, 2)
    stats.docs_per_second = round(stats.embedded / stats.seconds_encoding, 1) if stats.seconds_encoding else 0.0
    with engine.connect() as conn:
        stats.table_bytes = conn.execute(text(f"select pg_total_relation_size('\"{schema}\".lot_embeddings')")).scalar()
        stats.index_bytes = conn.execute(text(
            f"select coalesce(sum(pg_relation_size(i.indexrelid)), 0) from pg_index i join pg_class c on "
            f"c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = :s "
            f"and c.relname = 'lot_embeddings'"), {"s": schema}).scalar()
    return stats
