"""Full-text search documents (Phase 6): ``auction_search.lot_search_documents``.

One row per lot with its French/English title and description start, the Drouot category, the
auction date and the source URL, plus two weighted ``tsvector`` columns (title = weight A,
description start = weight B) built with PostgreSQL's ``french`` and ``english`` configurations.
Accents are folded in Python (``fold``) because the ``unaccent`` extension is not installed; queries
are folded the same way. Rebuilt incrementally by content hash; the source rows are only read.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from sqlalchemy import Engine, text

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource
from auction_search.enrichment.text import clean, strip_title_prefix
from auction_search.taxonomy.normalization import normalize_term
from auction_search.text.language import detect_language

log = logging.getLogger(__name__)

LEAD_CHARS = 600


def fold(value: str | None) -> str:
    """Accent- and case-folded text for to_tsvector / to_tsquery."""
    return normalize_term(value or "")


@dataclass
class IndexStats:
    lots_seen: int = 0
    indexed: int = 0
    unchanged_skipped: int = 0
    seconds: float = 0.0


def build_search_index(engine: Engine, schema: str, structure: StructureReport, limit: int | None = None,
                       batch_size: int = 1000, force: bool = False) -> IndexStats:
    stats = IndexStats()
    t0 = time.perf_counter()
    source = LotSource(structure)
    s = f'"{schema}"'
    with engine.connect() as read_conn:
        existing = dict(read_conn.execute(text(f"select lot_id, content_hash from {s}.lot_search_documents")).all())
        for batch in source.iter_batches(read_conn, batch_size=batch_size, limit=limit):
            rows = []
            for lot in batch:
                stats.lots_seen += 1
                h = lot.content_hash()
                if not force and existing.get(lot.lot_id) == h:
                    stats.unchanged_skipped += 1
                    continue
                doc = {"lot": lot.lot_id, "src": lot.source, "sid": lot.source_lot_id, "auction": lot.auction_key,
                       "cat": lot.category.get("fr"), "hash": h}
                for lang in ("fr", "en"):
                    title = clean(lot.title.get(lang))
                    lead = strip_title_prefix(clean(lot.description.get(lang)), title)[:LEAD_CHARS]
                    ok = lambda v: v if v and detect_language(v) in (lang, "unknown") else ""  # noqa: E731
                    doc[f"title_{lang}"], doc[f"lead_{lang}"] = title, lead
                    doc[f"ft_{lang}"], doc[f"fl_{lang}"] = fold(ok(title)), fold(ok(lead))
                rows.append(doc)
            if not rows:
                continue
            with engine.begin() as conn:
                conn.execute(text(
                    f"insert into {s}.lot_search_documents (lot_id, source, source_lot_id, auction_key, title_fr, "
                    f"title_en, lead_fr, lead_en, category_fr, tsv_fr, tsv_en, content_hash, updated_at) values "
                    f"(:lot, :src, :sid, :auction, :title_fr, :title_en, :lead_fr, :lead_en, :cat, "
                    f"setweight(to_tsvector('french', :ft_fr), 'A') || setweight(to_tsvector('french', :fl_fr), 'B'), "
                    f"setweight(to_tsvector('english', :ft_en), 'A') || setweight(to_tsvector('english', :fl_en), 'B'), "
                    f":hash, now()) on conflict (lot_id) do update set auction_key = excluded.auction_key, "
                    f"title_fr = excluded.title_fr, title_en = excluded.title_en, lead_fr = excluded.lead_fr, "
                    f"lead_en = excluded.lead_en, category_fr = excluded.category_fr, tsv_fr = excluded.tsv_fr, "
                    f"tsv_en = excluded.tsv_en, content_hash = excluded.content_hash, updated_at = now()"), rows)
            stats.indexed += len(rows)
    _attach_auction_info(engine, schema, structure)
    stats.seconds = round(time.perf_counter() - t0, 2)
    return stats


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _attach_auction_info(engine: Engine, schema: str, structure: StructureReport) -> None:
    """Copy the auction date and the lot URL from the source (read-only) into the search documents."""
    m = structure.mapping
    if m is None:
        return
    urls = m.lots.by_language("url")
    url_col = urls.get("fr") or urls.get("en")
    dates = m.auctions.names("date")
    lots, auctions = f"{_q(m.schema)}.{_q(m.lots.table)}", f"{_q(m.schema)}.{_q(m.auctions.table)}"
    join = " and ".join(f"l.{_q(lc)} = a.{_q(ac)}" for lc, ac in m.join_columns)
    pk = _q(m.lots.primary_key[0])
    date_expr = f"a.{_q(dates[0])}" if dates else "null"
    url_expr = f"l.{_q(url_col)}" if url_col else "null"
    with engine.begin() as conn:
        conn.execute(text(
            f'update "{schema}".lot_search_documents d set auction_date = x.d, lot_url = x.u from '
            f"(select l.{pk} as id, {date_expr} as d, {url_expr} as u from {lots} l left join {auctions} a on {join}) x "
            f"where x.id = d.lot_id and (d.auction_date is distinct from x.d or d.lot_url is distinct from x.u)"))
