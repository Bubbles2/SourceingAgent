"""Read-only inspection of the PostgreSQL server and the source schema (``drouot_collector``).

Nothing here assumes table or column names. The program discovers tables, columns, keys,
indexes and relationships from the PostgreSQL catalogues, then *infers*:

* which table holds auctions and which holds lots (``detect_table_roles``), and
* what each column means — title, description, category, URL, … and its language
  (``classify_column``),

and records the evidence. The result (``SourceMapping``) is what later phases use to read
lots without hard-coding column names. If inference is wrong, it can be overridden on the
command line (``--auction-table`` / ``--lot-table``).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Connection, Engine, inspect, text

from auction_search.config import validate_identifier

log = logging.getLogger(__name__)

# Extensions that later phases may use; their availability is reported, never assumed.
EXTENSIONS_OF_INTEREST = ("vector", "pg_trgm", "unaccent", "fuzzystrmatch")


# --------------------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------------------


@dataclass
class ColumnInfo:
    name: str
    data_type: str
    nullable: bool
    default: str | None
    comment: str | None
    role: str
    language: str | None


@dataclass
class ForeignKeyInfo:
    name: str | None
    columns: list[str]
    referred_schema: str
    referred_table: str
    referred_columns: list[str]


@dataclass
class IndexInfo:
    name: str
    definition: str


@dataclass
class TableInfo:
    name: str
    kind: str  # "table" or "view"
    comment: str | None
    row_count: int | None
    row_count_is_estimate: bool
    total_bytes: int | None
    columns: list[ColumnInfo]
    primary_key: list[str]
    unique_constraints: list[dict[str, object]]
    check_constraints: list[dict[str, object]]
    foreign_keys: list[ForeignKeyInfo]
    indexes: list[IndexInfo]
    referenced_by: list[str] = field(default_factory=list)

    def column(self, name: str) -> ColumnInfo | None:
        return next((c for c in self.columns if c.name == name), None)

    def has_role(self, role: str) -> bool:
        return any(c.role == role for c in self.columns)


@dataclass
class ServerInfo:
    version: str
    version_num: int
    database: str
    current_user: str
    is_superuser: bool
    can_create_schema: bool
    installed_extensions: dict[str, dict[str, str]]
    extension_availability: dict[str, dict[str, object]]
    text_search_configs: list[str]
    app_schema: str
    app_schema_exists: bool


@dataclass
class SchemaSummary:
    name: str
    tables: int
    views: int
    total_bytes: int


@dataclass
class TableRoleDetection:
    auction_table: str | None
    lot_table: str | None
    confident: bool
    evidence: list[str]


@dataclass
class ColumnRef:
    name: str
    language: str | None


@dataclass
class TableMapping:
    """Column roles for one source table, e.g. ``columns["title"] = [title_fr(fr), title_en(en)]``."""

    table: str
    primary_key: list[str]
    columns: dict[str, list[ColumnRef]]

    def by_language(self, role: str) -> dict[str, str]:
        return {c.language: c.name for c in self.columns.get(role, []) if c.language}

    def names(self, role: str) -> list[str]:
        return [c.name for c in self.columns.get(role, [])]


@dataclass
class SourceMapping:
    """How to read auctions and lots from the source schema. Persisted as ``source_mapping.json``."""

    schema: str
    auctions: TableMapping
    lots: TableMapping
    # Pairs of (lot column, auction column) forming the lot -> auction foreign key.
    join_columns: list[tuple[str, str]]
    confident: bool
    evidence: list[str]


@dataclass
class StructureReport:
    generated_at: str
    target: str
    server: ServerInfo
    schemas: list[SchemaSummary]
    schema: str
    tables: list[TableInfo]
    relationships: list[str]
    detection: TableRoleDetection
    mapping: SourceMapping | None


# --------------------------------------------------------------------------------------
# Inference rules (pure functions — unit tested)
# --------------------------------------------------------------------------------------

_LANG_SUFFIX = re.compile(r"_(fr|en|de|it|es|nl)$")

# First matching rule wins; applied to the column name without its language suffix.
_NAME_RULES: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (role, re.compile(pattern))
    for role, pattern in (
        ("error", r"error"),
        ("status", r"status|(^|_)state$"),
        ("image_url", r"image|photo|(^|_)img|thumbnail|picture"),
        ("url", r"url|link|href"),
        ("lot_number", r"^lot_(number|no|num)$|^numero"),
        ("title", r"title|titre|^name$|^nom$|heading"),
        ("description", r"desc"),
        ("category", r"categ|department|departement|specialt"),
        ("auction_house", r"house|maison|auctioneer|etude|commissaire"),
        ("currency", r"currency|devise"),
        ("price", r"price|prix|estimate|estimation|hammer|adjudication|reserve"),
        ("count", r"(^|_)count$|^nb_|number_of"),
        ("source", r"^source$"),
        ("identifier", r"^id$|_id$|^uuid$"),
    )
)
_RECORD_TIMESTAMP = re.compile(r"^(updated|created|modified|inserted|deleted)(_|$)")


def classify_column(name: str, data_type: str) -> tuple[str, str | None]:
    """Infer ``(role, language)`` for a column from its name and SQL type.

    >>> classify_column("description_fr", "text")
    ('description', 'fr')
    >>> classify_column("updated_at", "timestamp with time zone")
    ('record_timestamp', None)
    """
    lowered = name.lower()
    match = _LANG_SUFFIX.search(lowered)
    language = match.group(1) if match else None
    stem = lowered[: match.start()] if match else lowered
    dtype = data_type.lower()

    if dtype.startswith(("timestamp", "date")):
        return ("record_timestamp" if _RECORD_TIMESTAMP.search(stem) else "date"), language
    if dtype in ("json", "jsonb"):
        return "metadata", language
    for role, pattern in _NAME_RULES:
        if pattern.search(stem):
            return role, language
    return "other", language


_LOT_NAME = re.compile(r"(^|_)lots?($|_)")
_AUCTION_NAME = re.compile(r"(^|_)(auctions?|ventes?|sales?)($|_)")
_EXACT_LOT = {"lot", "lots"}
_EXACT_AUCTION = {"auction", "auctions", "vente", "ventes", "sale", "sales"}


def _content_score(table: TableInfo) -> int:
    return int(table.has_role("title")) + int(table.has_role("description"))


def detect_table_roles(tables: list[TableInfo]) -> TableRoleDetection:
    """Pick the auction and lot tables by name, content columns and foreign keys, with evidence."""
    evidence: list[str] = []

    def score(table: TableInfo, pattern: re.Pattern[str], exact: set[str]) -> int:
        if not pattern.search(table.name):
            return 0
        return (3 if table.name in exact else 1) + _content_score(table)

    auction_scores = {t.name: score(t, _AUCTION_NAME, _EXACT_AUCTION) for t in tables}
    auction_candidates = sorted((s, n) for n, s in auction_scores.items() if s > 0)
    auction = auction_candidates[-1][1] if auction_candidates else None
    if auction:
        evidence.append(
            f"auction table '{auction}' chosen from candidates "
            + ", ".join(f"{n}(score {s})" for s, n in reversed(auction_candidates))
        )
    else:
        evidence.append("no table name looks like an auction table")

    lot_scores: dict[str, int] = {}
    for t in tables:
        if t.name == auction:
            continue
        s = score(t, _LOT_NAME, _EXACT_LOT)
        if s and auction and any(fk.referred_table == auction for fk in t.foreign_keys):
            s += 2
        if s:
            lot_scores[t.name] = s
    lot_candidates = sorted((s, n) for n, s in lot_scores.items())
    lot = lot_candidates[-1][1] if lot_candidates else None
    if lot:
        evidence.append(
            f"lot table '{lot}' chosen from candidates "
            + ", ".join(f"{n}(score {s})" for s, n in reversed(lot_candidates))
        )
    else:
        evidence.append("no table name looks like a lot table")

    linked = False
    if auction and lot:
        lot_table = next(t for t in tables if t.name == lot)
        for fk in lot_table.foreign_keys:
            if fk.referred_table == auction:
                linked = True
                evidence.append(
                    f"foreign key {lot}({', '.join(fk.columns)}) -> {auction}({', '.join(fk.referred_columns)})"
                )
        if not linked:
            evidence.append(f"WARNING: no foreign key links {lot} to {auction}")
    return TableRoleDetection(auction_table=auction, lot_table=lot, confident=linked, evidence=evidence)


def _table_mapping(table: TableInfo) -> TableMapping:
    columns: dict[str, list[ColumnRef]] = {}
    for col in table.columns:
        columns.setdefault(col.role, []).append(ColumnRef(col.name, col.language))
    return TableMapping(table=table.name, primary_key=list(table.primary_key), columns=columns)


def build_source_mapping(
    schema: str, tables: list[TableInfo], detection: TableRoleDetection
) -> SourceMapping | None:
    """Combine detected tables and column roles into a ``SourceMapping`` (``None`` if tables are missing)."""
    if not (detection.auction_table and detection.lot_table):
        return None
    by_name = {t.name: t for t in tables}
    auctions, lots = by_name[detection.auction_table], by_name[detection.lot_table]
    join: list[tuple[str, str]] = []
    fk = next((fk for fk in lots.foreign_keys if fk.referred_table == auctions.name), None)
    if fk:
        join = list(zip(fk.columns, fk.referred_columns))
    return SourceMapping(
        schema=schema,
        auctions=_table_mapping(auctions),
        lots=_table_mapping(lots),
        join_columns=join,
        confident=detection.confident,
        evidence=list(detection.evidence),
    )


# --------------------------------------------------------------------------------------
# Catalogue queries
# --------------------------------------------------------------------------------------


def inspect_server(conn: Connection, app_schema: str) -> ServerInfo:
    row = conn.execute(
        text(
            "select current_setting('server_version'), current_setting('server_version_num')::int, "
            "current_database(), current_user, "
            "(select rolsuper from pg_roles where rolname = current_user), "
            "has_database_privilege(current_database(), 'CREATE'), "
            "exists(select 1 from pg_namespace where nspname = :app_schema)"
        ),
        {"app_schema": app_schema},
    ).one()
    installed = {
        r.extname: {"version": r.extversion, "schema": r.nspname}
        for r in conn.execute(
            text(
                "select e.extname, e.extversion, n.nspname from pg_extension e "
                "join pg_namespace n on n.oid = e.extnamespace order by 1"
            )
        )
    }
    availability: dict[str, dict[str, object]] = {name: {"available": False} for name in EXTENSIONS_OF_INTEREST}
    for r in conn.execute(
        text(
            "select v.name, v.version, v.installed, v.superuser, v.trusted, a.default_version "
            "from pg_available_extension_versions v "
            "join pg_available_extensions a on a.name = v.name and a.default_version = v.version "
            "where v.name = any(:names)"
        ),
        {"names": list(EXTENSIONS_OF_INTEREST)},
    ):
        availability[r.name] = {
            "available": True,
            "default_version": r.default_version,
            "installed": r.installed,
            "requires_superuser": r.superuser,
            "trusted": r.trusted,
        }
    ts_configs = list(conn.execute(text("select cfgname from pg_ts_config order by 1")).scalars())
    return ServerInfo(
        version=row[0],
        version_num=row[1],
        database=row[2],
        current_user=row[3],
        is_superuser=bool(row[4]),
        can_create_schema=bool(row[5]),
        installed_extensions=installed,
        extension_availability=availability,
        text_search_configs=ts_configs,
        app_schema=app_schema,
        app_schema_exists=bool(row[6]),
    )


def list_schemas(conn: Connection) -> list[SchemaSummary]:
    rows = conn.execute(
        text(
            "select n.nspname, "
            "count(c.oid) filter (where c.relkind in ('r','p')), "
            "count(c.oid) filter (where c.relkind in ('v','m')), "
            "coalesce(sum(pg_total_relation_size(c.oid)) filter (where c.relkind in ('r','p','m')), 0) "
            "from pg_namespace n left join pg_class c on c.relnamespace = n.oid "
            "where n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema' "
            "group by n.nspname order by n.nspname"
        )
    )
    return [SchemaSummary(name=r[0], tables=r[1], views=r[2], total_bytes=int(r[3])) for r in rows]


def _columns(conn: Connection, schema: str, table: str) -> list[ColumnInfo]:
    rows = conn.execute(
        text(
            "select a.attname, format_type(a.atttypid, a.atttypmod), not a.attnotnull, "
            "pg_get_expr(d.adbin, d.adrelid), col_description(a.attrelid, a.attnum), a.attidentity "
            "from pg_attribute a "
            "join pg_class c on c.oid = a.attrelid "
            "join pg_namespace n on n.oid = c.relnamespace "
            "left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum "
            "where n.nspname = :schema and c.relname = :table and a.attnum > 0 and not a.attisdropped "
            "order by a.attnum"
        ),
        {"schema": schema, "table": table},
    )
    columns = []
    for name, dtype, nullable, default, comment, identity in rows:
        if identity == "a":
            default = "generated always as identity"
        elif identity == "d":
            default = "generated by default as identity"
        role, language = classify_column(name, dtype)
        columns.append(ColumnInfo(name, dtype, nullable, default, comment, role, language))
    return columns


def _indexes(conn: Connection, schema: str, table: str) -> list[IndexInfo]:
    rows = conn.execute(
        text("select indexname, indexdef from pg_indexes where schemaname = :s and tablename = :t order by 1"),
        {"s": schema, "t": table},
    )
    return [IndexInfo(name=r[0], definition=r[1]) for r in rows]


def _row_count(conn: Connection, schema: str, table: str, exact: bool) -> tuple[int | None, bool]:
    if exact:
        count = conn.execute(text(f'select count(*) from "{schema}"."{table}"')).scalar_one()
        return int(count), False
    estimate = conn.execute(
        text(
            "select c.reltuples::bigint from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            "where n.nspname = :s and c.relname = :t"
        ),
        {"s": schema, "t": table},
    ).scalar()
    return (int(estimate) if estimate is not None and estimate >= 0 else None), True


def inspect_schema(engine: Engine, schema: str, exact_counts: bool = True) -> list[TableInfo]:
    """Describe every table and view in ``schema``."""
    validate_identifier(schema)
    insp = inspect(engine)
    if schema not in insp.get_schema_names():
        raise LookupError(f"schema {schema!r} not found in database")

    tables: list[TableInfo] = []
    with engine.connect() as conn:
        relations = [(n, "table") for n in insp.get_table_names(schema=schema)]
        relations += [(n, "view") for n in insp.get_view_names(schema=schema)]
        for name, kind in sorted(relations):
            pk = insp.get_pk_constraint(name, schema=schema) if kind == "table" else {}
            fks = insp.get_foreign_keys(name, schema=schema) if kind == "table" else []
            uniques = insp.get_unique_constraints(name, schema=schema) if kind == "table" else []
            checks = insp.get_check_constraints(name, schema=schema) if kind == "table" else []
            count, estimated = _row_count(conn, schema, name, exact_counts)
            size = conn.execute(
                text("select pg_total_relation_size(cast(:rel as regclass))"), {"rel": f'"{schema}"."{name}"'}
            ).scalar()
            comment = insp.get_table_comment(name, schema=schema).get("text")
            table = TableInfo(
                name=name,
                kind=kind,
                comment=comment,
                row_count=count,
                row_count_is_estimate=estimated,
                total_bytes=int(size) if size is not None else None,
                columns=_columns(conn, schema, name),
                primary_key=list(pk.get("constrained_columns") or []),
                unique_constraints=[{"name": u["name"], "columns": u["column_names"]} for u in uniques],
                check_constraints=[{"name": c["name"], "definition": c["sqltext"]} for c in checks],
                foreign_keys=[
                    ForeignKeyInfo(
                        name=fk.get("name"),
                        columns=fk["constrained_columns"],
                        referred_schema=fk.get("referred_schema") or schema,
                        referred_table=fk["referred_table"],
                        referred_columns=fk["referred_columns"],
                    )
                    for fk in fks
                ],
                indexes=_indexes(conn, schema, name),
            )
            tables.append(table)
            log.info("table inspected", extra={"table": f"{schema}.{name}", "kind": kind, "rows": count})

    by_name = {t.name: t for t in tables}
    for t in tables:
        for fk in t.foreign_keys:
            target = by_name.get(fk.referred_table)
            if target is not None and fk.referred_schema == schema:
                target.referenced_by.append(f"{t.name}({', '.join(fk.columns)})")
    return tables


def describe_relationships(tables: list[TableInfo]) -> list[str]:
    return [
        f"{t.name}({', '.join(fk.columns)}) -> {fk.referred_schema}.{fk.referred_table}"
        f"({', '.join(fk.referred_columns)})"
        for t in tables
        for fk in t.foreign_keys
    ]


def build_structure_report(
    engine: Engine,
    schema: str,
    app_schema: str,
    target: str,
    exact_counts: bool = True,
    auction_table: str | None = None,
    lot_table: str | None = None,
) -> StructureReport:
    """Run the full Phase 1 structure inspection. ``auction_table``/``lot_table`` override detection."""
    with engine.connect() as conn:
        server = inspect_server(conn, app_schema)
        schemas = list_schemas(conn)
    tables = inspect_schema(engine, schema, exact_counts=exact_counts)

    detection = detect_table_roles(tables)
    names = {t.name for t in tables}
    for override, attr in ((auction_table, "auction_table"), (lot_table, "lot_table")):
        if override:
            if override not in names:
                raise LookupError(f"table {override!r} not found in schema {schema!r}")
            setattr(detection, attr, override)
            detection.evidence.append(f"{attr} overridden on the command line: {override}")
    if auction_table or lot_table:
        lots = next((t for t in tables if t.name == detection.lot_table), None)
        detection.confident = bool(
            lots and any(fk.referred_table == detection.auction_table for fk in lots.foreign_keys)
        )

    return StructureReport(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        target=target,
        server=server,
        schemas=schemas,
        schema=schema,
        tables=tables,
        relationships=describe_relationships(tables),
        detection=detection,
        mapping=build_source_mapping(schema, tables, detection),
    )
