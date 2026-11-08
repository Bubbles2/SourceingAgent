"""Read-only data-quality profiling of the source auctions and lots.

Driven entirely by the ``SourceMapping`` produced by ``inspection.py`` — table and column names
are never hard-coded here. Computes, for the lot table (optionally limited to the first N lots):

* null / blank / distinct counts for every column,
* title and description length distributions,
* duplicate lot numbers and duplicated texts,
* French/English field coverage and a language check of their actual content,
* category distribution and French→English category consistency,
* auctions: lots per auction, date range, auction houses, statuses,
* representative sample lots across categories.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Connection, Engine, text

from auction_search.database.inspection import SourceMapping, StructureReport, TableInfo
from auction_search.text.language import detect_language

log = logging.getLogger(__name__)

TEXT_ROLES = ("title", "description")
SHORT_TEXT_CHARS = 20


def _q(identifier: str) -> str:
    """Quote a catalogue-derived identifier for SQL."""
    return '"' + identifier.replace('"', '""') + '"'


def _is_text(data_type: str) -> bool:
    return data_type == "text" or data_type.startswith(("character", "varchar"))


# --------------------------------------------------------------------------------------
# Result model
# --------------------------------------------------------------------------------------


@dataclass
class ColumnProfile:
    column: str
    data_type: str
    role: str
    language: str | None
    nulls: int
    blanks: int | None
    distinct: int | None


@dataclass
class LengthStats:
    table: str
    column: str
    non_empty: int
    min: int | None
    p10: int | None
    median: int | None
    p90: int | None
    max: int | None
    avg: float | None
    shorter_than_20: int


@dataclass
class DuplicateStats:
    check: str
    groups: int
    rows: int
    examples: list[dict[str, object]] = field(default_factory=list)


@dataclass
class HygieneCheck:
    column: str
    check: str
    rows: int
    non_empty: int


@dataclass
class LanguagePairStats:
    table: str
    role: str
    columns: dict[str, str]
    rows: int
    both: int
    only: dict[str, int]
    neither: int
    identical: int


@dataclass
class LanguageCheck:
    table: str
    column: str
    declared: str
    sampled: int
    detected: dict[str, int]
    mismatch_examples: list[dict[str, object]]


@dataclass
class CategoryStats:
    columns: dict[str, str]
    distinct: dict[str, int]
    uncategorised: int
    categories: list[dict[str, object]]
    inconsistent_translations: list[dict[str, object]]


@dataclass
class AuctionStats:
    auctions: int
    auctions_with_lots: int
    auctions_without_lots: int
    lots_per_auction: dict[str, float | int | None]
    date_ranges: list[dict[str, object]]
    auction_houses_distinct: int | None
    top_auction_houses: list[dict[str, object]]


@dataclass
class DataQualityReport:
    generated_at: str
    target: str
    schema: str
    auction_table: str
    lot_table: str
    lot_limit: int | None
    lots_analysed: int
    orphan_lots: int
    column_profiles: dict[str, list[ColumnProfile]]
    lengths: list[LengthStats]
    duplicates: list[DuplicateStats]
    hygiene: list[HygieneCheck]
    language_pairs: list[LanguagePairStats]
    language_checks: list[LanguageCheck]
    categories: CategoryStats | None
    auctions: AuctionStats
    status_values: dict[str, list[dict[str, object]]]
    error_counts: dict[str, int]
    timings_seconds: dict[str, float]


@dataclass
class SampleSet:
    generated_at: str
    category_column: str | None
    samples_per_category: int
    # Which sample keys hold what, so renderers need no column names:
    # {"pk", "lot_number", "auction_key", "auction_date": key | None, "titles"/"descriptions": {lang: key}}
    display: dict[str, object]
    samples: list[dict[str, object]]


# --------------------------------------------------------------------------------------
# Profiler
# --------------------------------------------------------------------------------------


class LotProfiler:
    """Runs the profiling queries. One instance per run; all access is read-only."""

    def __init__(self, engine: Engine, structure: StructureReport, lot_limit: int | None = None) -> None:
        if structure.mapping is None:
            raise ValueError("auction/lot tables were not identified; run inspect-db and check detection")
        self.engine = engine
        self.structure = structure
        self.m: SourceMapping = structure.mapping
        self.limit = lot_limit
        tables = {t.name: t for t in structure.tables}
        self.lot_info: TableInfo = tables[self.m.lots.table]
        self.auction_info: TableInfo = tables[self.m.auctions.table]

        schema = _q(self.m.schema)
        self.lots_table = f"{schema}.{_q(self.m.lots.table)}"
        self.auctions_table = f"{schema}.{_q(self.m.auctions.table)}"
        self.lot_pk = self.m.lots.primary_key[0] if self.m.lots.primary_key else None
        if lot_limit:
            order = _q(self.lot_pk) if self.lot_pk else "1"
            self.lot_src = f"(select * from {self.lots_table} order by {order} limit {int(lot_limit)})"
        else:
            self.lot_src = self.lots_table
        self.join_on = " and ".join(f"l.{_q(lc)} = a.{_q(ac)}" for lc, ac in self.m.join_columns) or "false"
        self.lot_fk_cols = [lc for lc, _ in self.m.join_columns]
        # Columns that identify *which* auction a lot belongs to. A composite FK may include a
        # constant discriminator such as ``source``; leave it out so "distinct auctions" is meaningful.
        source_cols = set(self.m.lots.names("source"))
        self.auction_ref_cols = [c for c in self.lot_fk_cols if c not in source_cols] or self.lot_fk_cols
        self.timings: dict[str, float] = {}

    # -- helpers ---------------------------------------------------------------------

    def _timed(self, name: str, fn, *args):  # type: ignore[no-untyped-def]
        start = time.perf_counter()
        result = fn(*args)
        self.timings[name] = round(time.perf_counter() - start, 3)
        log.info("profiling step done", extra={"step": name, "seconds": self.timings[name]})
        return result

    def _source(self, table: TableInfo) -> str:
        return self.lot_src if table is self.lot_info else self.auctions_table

    # -- sections --------------------------------------------------------------------

    def column_profiles(self, conn: Connection, table: TableInfo) -> list[ColumnProfile]:
        exprs = ["count(*)"]
        for c in table.columns:
            col = _q(c.name)
            exprs.append(f"count(*) - count({col})")
            exprs.append(f"count(*) filter (where btrim({col}) = '')" if _is_text(c.data_type) else "null")
            exprs.append(f"count(distinct {col})" if c.data_type != "json" else "null")
        row = conn.execute(text(f"select {', '.join(exprs)} from {self._source(table)} l")).one()
        profiles = []
        for i, c in enumerate(table.columns):
            nulls, blanks, distinct = row[1 + 3 * i : 4 + 3 * i]
            profiles.append(ColumnProfile(c.name, c.data_type, c.role, c.language, nulls, blanks, distinct))
        return profiles

    def lengths(self, conn: Connection) -> list[LengthStats]:
        stats = []
        for table, mapping in ((self.lot_info, self.m.lots), (self.auction_info, self.m.auctions)):
            for role in TEXT_ROLES:
                for name in mapping.names(role):
                    col = _q(name)
                    r = conn.execute(
                        text(
                            f"select count(*), min(n), percentile_disc(0.1) within group (order by n), "
                            f"percentile_disc(0.5) within group (order by n), "
                            f"percentile_disc(0.9) within group (order by n), max(n), avg(n), "
                            f"count(*) filter (where n < {SHORT_TEXT_CHARS}) "
                            f"from (select length(btrim({col})) n from {self._source(table)} l "
                            f"where nullif(btrim({col}), '') is not null) x"
                        )
                    ).one()
                    stats.append(
                        LengthStats(table.name, name, r[0], r[1], r[2], r[3], r[4], r[5],
                                    round(float(r[6]), 1) if r[6] is not None else None, r[7])
                    )
        return stats

    def duplicates(self, conn: Connection) -> list[DuplicateStats]:
        results = []
        number_col = (self.m.lots.names("lot_number") or [None])[0]
        if number_col and self.lot_fk_cols:
            keys = ", ".join(_q(c) for c in [*self.lot_fk_cols, number_col])
            dup = (
                f"select {keys}, count(*) n from {self.lot_src} l where {_q(number_col)} is not null "
                f"group by {keys} having count(*) > 1"
            )
            groups, rows = conn.execute(text(f"select count(*), coalesce(sum(n), 0) from ({dup}) d")).one()
            examples = [dict(r._mapping) for r in conn.execute(text(f"{dup} order by n desc limit 5"))]
            label = ", ".join([*self.lot_fk_cols, number_col])
            results.append(DuplicateStats(f"same lot number within an auction ({label})", groups, int(rows), examples))

        auction_key = f"({', '.join(_q(c) for c in self.auction_ref_cols)})" if self.auction_ref_cols else "null"
        for role in TEXT_ROLES:
            for name in self.m.lots.names(role):
                col = _q(name)
                dup = (
                    f"select md5({col}) h, count(*) n, count(distinct {auction_key}) auctions, "
                    f"left(min({col}), 160) example from {self.lot_src} l "
                    f"where nullif(btrim({col}), '') is not null group by md5({col}) having count(*) > 1"
                )
                groups, rows, cross = conn.execute(
                    text(f"select count(*), coalesce(sum(n), 0), count(*) filter (where auctions > 1) from ({dup}) d")
                ).one()
                examples = [
                    {"count": r.n, "auctions": r.auctions, "text": r.example}
                    for r in conn.execute(text(f"{dup} order by n desc limit 5"))
                ]
                results.append(
                    DuplicateStats(
                        f"identical {name} shared by several lots ({cross} groups span >1 auction)",
                        groups, int(rows), examples,
                    )
                )

        titles = self.m.lots.by_language("title")
        descs = self.m.lots.by_language("description")
        lang = next((x for x in ("fr", "en") if x in titles and x in descs), None)
        if lang:
            t, d = _q(titles[lang]), _q(descs[lang])
            dup = (
                f"select md5(coalesce({t}, '') || '|' || coalesce({d}, '')) h, count(*) n, "
                f"count(distinct {auction_key}) auctions from {self.lot_src} l "
                f"where nullif(btrim(coalesce({t}, '') || coalesce({d}, '')), '') is not null "
                f"group by 1 having count(*) > 1"
            )
            groups, rows = conn.execute(text(f"select count(*), coalesce(sum(n), 0) from ({dup}) d")).one()
            results.append(DuplicateStats(f"identical title+description ({lang}) — possible re-listed lots",
                                          groups, int(rows)))
        return results

    def hygiene(self, conn: Connection) -> list[HygieneCheck]:
        """Text issues that matter when building searchable text in later phases."""
        checks: list[HygieneCheck] = []
        titles, descs = self.m.lots.by_language("title"), self.m.lots.by_language("description")
        for lang, title in titles.items():
            desc = descs.get(lang)
            if not desc:
                continue
            t, d = _q(title), _q(desc)
            rows, non_empty = conn.execute(
                text(
                    f"select count(*) filter (where left(btrim({d}), length(btrim({t}))) = btrim({t})), count(*) "
                    f"from {self.lot_src} l where nullif(btrim({t}), '') is not null"
                )
            ).one()
            checks.append(HygieneCheck(desc, f"starts with the full {title} text", rows, non_empty))

        patterns = (
            ("HTML entities (e.g. `&amp;`)", r"&(amp|quot|apos|lt|gt|nbsp|#[0-9]+);"),
            ("HTML tags", r"<[a-zA-Z/][^>]*>"),
            ("leading sub-lot numbering ('1 - ...')", r"^\s*[0-9]+\s*-\s"),
        )
        for role in TEXT_ROLES:
            for name in self.m.lots.names(role):
                col = _q(name)
                exprs = ", ".join(f"count(*) filter (where {col} ~ :p{i})" for i in range(len(patterns)))
                row = conn.execute(
                    text(f"select count(*), {exprs} from {self.lot_src} l where nullif(btrim({col}), '') is not null"),
                    {f"p{i}": p for i, (_, p) in enumerate(patterns)},
                ).one()
                checks += [HygieneCheck(name, label, row[i + 1], row[0]) for i, (label, _) in enumerate(patterns)]
        return checks

    def language_pairs(self, conn: Connection) -> list[LanguagePairStats]:
        pairs = []
        for table, mapping in ((self.lot_info, self.m.lots), (self.auction_info, self.m.auctions)):
            for role in (*TEXT_ROLES, "category"):
                cols = mapping.by_language(role)
                if not {"fr", "en"} <= cols.keys():
                    continue
                fr, en = _q(cols["fr"]), _q(cols["en"])
                has_fr, has_en = f"nullif(btrim({fr}), '') is not null", f"nullif(btrim({en}), '') is not null"
                r = conn.execute(
                    text(
                        f"select count(*), count(*) filter (where {has_fr} and {has_en}), "
                        f"count(*) filter (where {has_fr} and not {has_en}), "
                        f"count(*) filter (where {has_en} and not {has_fr}), "
                        f"count(*) filter (where not {has_fr} and not {has_en}), "
                        f"count(*) filter (where {has_fr} and btrim({fr}) = btrim({en})) "
                        f"from {self._source(table)} l"
                    )
                ).one()
                pairs.append(
                    LanguagePairStats(table.name, role, {"fr": cols["fr"], "en": cols["en"]}, r[0], r[1],
                                      {"fr": r[2], "en": r[3]}, r[4], r[5])
                )
        return pairs

    def language_checks(self, conn: Connection, sample_size: int) -> list[LanguageCheck]:
        checks = []
        for table, mapping in ((self.lot_info, self.m.lots), (self.auction_info, self.m.auctions)):
            columns = [(c.name, c.language) for role in TEXT_ROLES for c in mapping.columns.get(role, []) if c.language]
            if not columns:
                continue
            pk = mapping.primary_key[0] if mapping.primary_key else None
            select = ", ".join(_q(n) for n, _ in columns)
            order = f"order by md5(cast({_q(pk)} as text))" if pk else ""
            limit = f"limit {int(sample_size)}" if sample_size and table is self.lot_info else ""
            pk_expr = _q(pk) if pk else "null"
            rows = conn.execute(text(f"select {pk_expr}, {select} from {self._source(table)} l {order} {limit}")).all()
            for idx, (name, declared) in enumerate(columns, start=1):
                detected: Counter[str] = Counter()
                examples: list[dict[str, object]] = []
                sampled = 0
                for row in rows:
                    value = row[idx]
                    if not value or not value.strip():
                        continue
                    sampled += 1
                    lang = detect_language(value)
                    detected[lang] += 1
                    if lang not in (declared, "unknown") and len(examples) < 5:
                        examples.append({"id": row[0], "detected": lang, "text": value[:160]})
                checks.append(LanguageCheck(table.name, name, declared or "", sampled,
                                            dict(detected.most_common()), examples))
        return checks

    def categories(self, conn: Connection) -> CategoryStats | None:
        cols = self.m.lots.by_language("category")
        if not cols:
            plain = self.m.lots.names("category")
            if not plain:
                return None
            cols = {"default": plain[0]}
        langs = [x for x in ("fr", "en") if x in cols] or list(cols)
        quoted = [_q(cols[x]) for x in langs]
        distinct = {
            x: conn.execute(text(f"select count(distinct {q}) from {self.lot_src} l")).scalar_one()
            for x, q in zip(langs, quoted)
        }
        any_present = " or ".join(f"nullif(btrim({q}), '') is not null" for q in quoted)
        uncategorised = conn.execute(
            text(f"select count(*) from {self.lot_src} l where not ({any_present})")
        ).scalar_one()
        group = ", ".join(quoted)
        categories = [
            {**{x: r[i] for i, x in enumerate(langs)}, "lots": r[len(langs)]}
            for r in conn.execute(
                text(f"select {group}, count(*) from {self.lot_src} l group by {group} order by count(*) desc, 1")
            )
        ]
        inconsistent: list[dict[str, object]] = []
        if len(quoted) == 2:
            a, b = quoted
            inconsistent = [
                {langs[0]: r[0], f"{langs[1]}_values": list(r[1]), "lots": r[2]}
                for r in conn.execute(
                    text(
                        f"select {a}, array_agg(distinct coalesce({b}, '<null>')), count(*) from {self.lot_src} l "
                        f"where {a} is not null group by {a} having count(distinct coalesce({b}, '<null>')) > 1 "
                        f"order by count(*) desc"
                    )
                )
            ]
        return CategoryStats(cols, distinct, uncategorised, categories, inconsistent)

    def auctions(self, conn: Connection) -> AuctionStats:
        total = conn.execute(text(f"select count(*) from {self.auctions_table}")).scalar_one()
        a_cols = ", ".join(f"a.{_q(ac)}" for _, ac in self.m.join_columns) or "1"
        per = (
            f"select {a_cols}, count(l.*) n from {self.auctions_table} a "
            f"left join {self.lot_src} l on {self.join_on} group by {a_cols}"
        )
        r = conn.execute(
            text(
                f"select count(*) filter (where n > 0), count(*) filter (where n = 0), min(n) filter (where n > 0), "
                f"avg(n) filter (where n > 0), percentile_disc(0.5) within group (order by n) filter (where n > 0), "
                f"max(n) from ({per}) p"
            )
        ).one()
        lots_per = {"min": r[2], "avg": round(float(r[3]), 1) if r[3] is not None else None, "median": r[4],
                    "max": r[5]}

        date_ranges = []
        for name in self.m.auctions.names("date"):
            col = _q(name)
            d = conn.execute(
                text(f"select min({col}), max({col}), count(*) - count({col}) from {self.auctions_table}")
            ).one()
            date_ranges.append({"column": name, "min": d[0], "max": d[1], "nulls": d[2]})

        houses_distinct, top_houses = None, []
        house = (self.m.auctions.names("auction_house") or [None])[0]
        if house:
            col = _q(house)
            houses_distinct = conn.execute(text(f"select count(distinct {col}) from {self.auctions_table}")).scalar()
            top_houses = [
                {"auction_house": h, "auctions": n}
                for h, n in conn.execute(
                    text(f"select {col}, count(*) from {self.auctions_table} group by 1 order by 2 desc, 1 limit 25")
                )
            ]
        return AuctionStats(total, r[0], r[1], lots_per, date_ranges, houses_distinct, top_houses)

    def statuses(self, conn: Connection) -> tuple[dict[str, list[dict[str, object]]], dict[str, int]]:
        values: dict[str, list[dict[str, object]]] = {}
        errors: dict[str, int] = {}
        for table, mapping in ((self.lot_info, self.m.lots), (self.auction_info, self.m.auctions)):
            src = self._source(table)
            for name in mapping.names("status"):
                values[f"{table.name}.{name}"] = [
                    {"value": v, "rows": n}
                    for v, n in conn.execute(text(f"select {_q(name)}, count(*) from {src} l group by 1 order by 2 desc"))
                ]
            for name in mapping.names("error"):
                errors[f"{table.name}.{name}"] = conn.execute(
                    text(f"select count(*) from {src} l where nullif(btrim({_q(name)}), '') is not null")
                ).scalar_one()
        return values, errors

    def orphan_lots(self, conn: Connection) -> int:
        if not self.m.join_columns:
            return 0
        return conn.execute(
            text(f"select count(*) from {self.lot_src} l where not exists "
                 f"(select 1 from {self.auctions_table} a where {self.join_on})")
        ).scalar_one()

    def samples(self, conn: Connection, per_category: int, max_categories: int) -> SampleSet:
        lots, auctions = self.m.lots, self.m.auctions
        cat_cols = lots.by_language("category")
        cat = cat_cols.get("en") or cat_cols.get("fr") or (lots.names("category") or [None])[0]

        def auction_alias(name: str) -> str:
            return name if name.startswith("auction") else f"auction_{name}"

        wanted: list[tuple[str, str]] = []  # (alias, sql expression)
        for role in ("identifier", "lot_number", "title", "description", "category", "url", "image_url", "currency"):
            for c in lots.columns.get(role, []):
                wanted.append((c.name, f"l.{_q(c.name)}"))
        for role in ("title", "date", "auction_house"):
            for c in auctions.columns.get(role, []):
                if c.language in (None, "fr", "en"):
                    wanted.append((auction_alias(c.name), f"a.{_q(c.name)}"))
        auction_dates = auctions.names("date")
        display: dict[str, object] = {
            "pk": self.lot_pk,
            "lot_number": (lots.names("lot_number") or [None])[0],
            "auction_key": self.auction_ref_cols[0] if self.auction_ref_cols else None,
            "auction_date": auction_alias(auction_dates[0]) if auction_dates else None,
            "titles": lots.by_language("title"),
            "descriptions": lots.by_language("description"),
        }
        seen: set[str] = set()
        select_items = []
        for alias, expr in wanted:
            if alias not in seen:
                seen.add(alias)
                select_items.append(f"{expr} as {_q(alias)}")
        select = ", ".join(select_items)
        pk = _q(self.lot_pk) if self.lot_pk else "l.ctid"
        cat_expr = f"coalesce(nullif(btrim(l.{_q(cat)}), ''), '(none)')" if cat else "'(all)'"
        sql = (
            f"with ranked as (select {select}, {cat_expr} as sample_category, "
            f"row_number() over (partition by {cat_expr} order by md5(cast(l.{pk} as text))) rn, "
            f"count(*) over (partition by {cat_expr}) category_size "
            f"from {self.lot_src} l left join {self.auctions_table} a on {self.join_on}), "
            f"top as (select sample_category from ranked group by 1 order by count(*) desc, 1 limit :max_categories) "
            f"select r.* from ranked r join top t using (sample_category) where rn <= :per_category "
            f"order by category_size desc, sample_category, rn"
        )
        rows = [
            {k: v for k, v in r._mapping.items() if k != "rn"}
            for r in conn.execute(text(sql), {"max_categories": max_categories, "per_category": per_category})
        ]
        return SampleSet(datetime.now(timezone.utc).isoformat(timespec="seconds"), cat, per_category, display, rows)


def build_data_quality_report(
    engine: Engine,
    structure: StructureReport,
    target: str,
    lot_limit: int | None = None,
    language_sample: int = 0,
    samples_per_category: int = 3,
    max_categories: int = 40,
) -> tuple[DataQualityReport, SampleSet]:
    """Run every profiling step and return the report plus the representative samples."""
    p = LotProfiler(engine, structure, lot_limit)
    with engine.connect() as conn:
        lots_analysed = conn.execute(text(f"select count(*) from {p.lot_src} l")).scalar_one()
        profiles = {
            p.lot_info.name: p._timed("column_profiles_lots", p.column_profiles, conn, p.lot_info),
            p.auction_info.name: p._timed("column_profiles_auctions", p.column_profiles, conn, p.auction_info),
        }
        lengths = p._timed("lengths", p.lengths, conn)
        duplicates = p._timed("duplicates", p.duplicates, conn)
        hygiene = p._timed("hygiene", p.hygiene, conn)
        pairs = p._timed("language_pairs", p.language_pairs, conn)
        checks = p._timed("language_checks", p.language_checks, conn, language_sample)
        categories = p._timed("categories", p.categories, conn)
        auctions = p._timed("auctions", p.auctions, conn)
        status_values, error_counts = p._timed("statuses", p.statuses, conn)
        orphans = p._timed("orphan_lots", p.orphan_lots, conn)
        samples = p._timed("samples", p.samples, conn, samples_per_category, max_categories)

    report = DataQualityReport(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        target=target,
        schema=p.m.schema,
        auction_table=p.m.auctions.table,
        lot_table=p.m.lots.table,
        lot_limit=lot_limit,
        lots_analysed=lots_analysed,
        orphan_lots=orphans,
        column_profiles=profiles,
        lengths=lengths,
        duplicates=duplicates,
        hygiene=hygiene,
        language_pairs=pairs,
        language_checks=checks,
        categories=categories,
        auctions=auctions,
        status_values=status_values,
        error_counts=error_counts,
        timings_seconds=p.timings,
    )
    return report, samples
