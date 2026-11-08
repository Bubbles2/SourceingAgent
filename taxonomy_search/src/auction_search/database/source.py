"""Read source lots in batches, using the column roles discovered in Phase 1 (no hard-coded names).

``LotSource`` turns a ``StructureReport`` into one SELECT over the lot table and yields
``SourceLot`` objects with language-keyed titles, descriptions and categories. Batches use keyset
pagination on the primary key, so a job can resume after the last processed id.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from dataclasses import dataclass, field

from sqlalchemy import Connection, text

from auction_search.database.inspection import StructureReport


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


@dataclass
class SourceLot:
    lot_id: int
    source: str
    source_lot_id: str
    auction_key: str
    title: dict[str, str] = field(default_factory=dict)
    description: dict[str, str] = field(default_factory=dict)
    category: dict[str, str | None] = field(default_factory=dict)

    def content_hash(self) -> str:
        """Hash of every text the extractors read; unchanged text → same hash → cache hit."""
        payload = json.dumps([self.title, self.description, self.category], sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class LotSource:
    def __init__(self, structure: StructureReport) -> None:
        m = structure.mapping
        if m is None:
            raise ValueError("auction/lot tables were not identified; run inspect-db")
        lots = next(t for t in structure.tables if t.name == m.lots.table)
        if not m.lots.primary_key:
            raise ValueError(f"lot table {m.lots.table} has no primary key")
        self.pk = m.lots.primary_key[0]
        source_cols = set(m.lots.names("source"))
        business = next((list(u["columns"]) for u in lots.unique_constraints), [self.pk])  # type: ignore[arg-type]
        self.source_col = next((c for c in business if c in source_cols), None)
        self.business_id_col = next(c for c in business if c != self.source_col)
        fk_cols = [lc for lc, _ in m.join_columns]
        self.auction_col = next((c for c in fk_cols if c not in source_cols), fk_cols[0] if fk_cols else None)
        self.titles = m.lots.by_language("title")
        self.descriptions = m.lots.by_language("description")
        self.categories = m.lots.by_language("category")
        self.table = f"{_q(m.schema)}.{_q(m.lots.table)}"

        cols: list[tuple[str, str]] = [("lot_id", self.pk), ("source_lot_id", self.business_id_col)]
        if self.source_col:
            cols.append(("source", self.source_col))
        if self.auction_col:
            cols.append(("auction_key", self.auction_col))
        for prefix, by_lang in (("title", self.titles), ("description", self.descriptions),
                                ("category", self.categories)):
            cols += [(f"{prefix}_{lang}", col) for lang, col in by_lang.items()]
        self._select = ", ".join(f"{_q(col)} as {_q(alias)}" for alias, col in cols)

    def count(self, conn: Connection) -> int:
        return int(conn.execute(text(f"select count(*) from {self.table}")).scalar_one())

    def iter_batches(self, conn: Connection, after_id: int = 0, batch_size: int = 500,
                     limit: int | None = None) -> Iterator[list[SourceLot]]:
        """Yield lists of lots ordered by primary key, starting after ``after_id``."""
        remaining = limit
        last = after_id
        while remaining is None or remaining > 0:
            n = batch_size if remaining is None else min(batch_size, remaining)
            rows = conn.execute(
                text(f"select {self._select} from {self.table} where {_q(self.pk)} > :last "
                     f"order by {_q(self.pk)} limit :n"), {"last": last, "n": n}
            ).mappings().all()
            if not rows:
                return
            batch = [self._lot(r) for r in rows]
            last = batch[-1].lot_id
            if remaining is not None:
                remaining -= len(batch)
            yield batch

    def _lot(self, r: object) -> SourceLot:
        row = dict(r)  # type: ignore[call-overload]
        return SourceLot(
            lot_id=int(row["lot_id"]),
            source=str(row.get("source") or "unknown"),
            source_lot_id=str(row["source_lot_id"]),
            auction_key=str(row.get("auction_key") or ""),
            title={lang: row[f"title_{lang}"] or "" for lang in self.titles},
            description={lang: row[f"description_{lang}"] or "" for lang in self.descriptions},
            category={lang: row[f"category_{lang}"] for lang in self.categories},
        )
