"""Markdown rendering of the database structure report produced by ``inspection.build_structure_report``."""

from __future__ import annotations

from auction_search.database.inspection import SourceMapping, StructureReport, TableInfo
from auction_search.reporting import human_bytes, md_table


def _yes_no(value: object) -> str:
    return "yes" if value else "no"


def _table_section(t: TableInfo) -> str:
    count = "" if t.row_count is None else f"{t.row_count:,}" + (" (estimate)" if t.row_count_is_estimate else "")
    lines = [
        f"### `{t.name}` ({t.kind})",
        "",
        f"- Rows: **{count}** — total size {human_bytes(t.total_bytes)}",
        f"- Primary key: `{', '.join(t.primary_key) or '—'}`",
    ]
    if t.comment:
        lines.append(f"- Comment: {t.comment}")
    for u in t.unique_constraints:
        lines.append(f"- Unique `{u['name']}`: ({', '.join(u['columns'])})")  # type: ignore[arg-type]
    for fk in t.foreign_keys:
        lines.append(
            f"- Foreign key `{fk.name}`: ({', '.join(fk.columns)}) → "
            f"`{fk.referred_schema}.{fk.referred_table}` ({', '.join(fk.referred_columns)})"
        )
    for ref in t.referenced_by:
        lines.append(f"- Referenced by: `{ref}`")
    for c in t.check_constraints:
        lines.append(f"- Check `{c['name']}`: `{c['definition']}`")
    lines += ["- Indexes:"] + [f"  - `{i.definition}`" for i in t.indexes]
    lines += [
        "",
        md_table(
            ["Column", "Type", "Nullable", "Default", "Inferred role", "Lang"],
            [
                (f"`{c.name}`", c.data_type, _yes_no(c.nullable), c.default or "", c.role, c.language or "")
                for c in t.columns
            ],
        ),
        "",
    ]
    return "\n".join(lines)


def _mapping_section(m: SourceMapping) -> str:
    lines = [
        "Join: " + ", ".join(f"`lots.{a}` = `auctions.{b}`" for a, b in m.join_columns),
        "",
    ]
    for label, tm in (("Auctions", m.auctions), ("Lots", m.lots)):
        rows = [
            (role, ", ".join(f"`{c.name}`" + (f" ({c.language})" if c.language else "") for c in cols))
            for role, cols in sorted(tm.columns.items())
        ]
        lines += [f"**{label}** — `{m.schema}.{tm.table}`, primary key `{', '.join(tm.primary_key)}`", "",
                  md_table(["Role", "Columns"], rows), ""]
    return "\n".join(lines)


def render_structure_markdown(r: StructureReport) -> str:
    s = r.server
    out = [
        "# Database structure report",
        "",
        f"- Generated: {r.generated_at}",
        f"- Target: `{r.target}`",
        "- Mode: read-only session (`default_transaction_read_only=on`); no data was modified.",
        "",
        "## 1. Server",
        "",
        md_table(
            ["Property", "Value"],
            [
                ("PostgreSQL version", s.version),
                ("Database", s.database),
                ("Connected as", s.current_user),
                ("Superuser", _yes_no(s.is_superuser)),
                ("Can create schemas (CREATE on database)", _yes_no(s.can_create_schema)),
                (f"Application schema `{s.app_schema}` exists", _yes_no(s.app_schema_exists)),
            ],
        ),
        "",
        "## 2. Extensions",
        "",
        md_table(
            ["Extension", "Installed", "Installed in schema", "Available (default version)",
             "Requires superuser", "Trusted"],
            [
                (
                    name,
                    s.installed_extensions.get(name, {}).get("version", "no"),
                    s.installed_extensions.get(name, {}).get("schema", ""),
                    info.get("default_version", "not available") if info.get("available") else "not available",
                    _yes_no(info.get("requires_superuser")) if info.get("available") else "",
                    _yes_no(info.get("trusted")) if info.get("available") else "",
                )
                for name, info in s.extension_availability.items()
            ],
        ),
        "",
        "All installed extensions: "
        + ", ".join(f"`{n}` {v['version']} ({v['schema']})" for n, v in s.installed_extensions.items()),
        "",
        "## 3. Full-text search configurations",
        "",
        "Available: " + ", ".join(f"`{c}`" for c in s.text_search_configs),
        "",
        "## 4. Schemas in the database",
        "",
        md_table(
            ["Schema", "Tables", "Views", "Size"],
            [(f"`{x.name}`" + (" ← source" if x.name == r.schema else ""), x.tables, x.views,
              human_bytes(x.total_bytes)) for x in r.schemas],
        ),
        "",
        f"## 5. Auction and lot tables detected in `{r.schema}`",
        "",
        f"- Auction table: `{r.detection.auction_table}`",
        f"- Lot table: `{r.detection.lot_table}`",
        f"- Confirmed by foreign key: {_yes_no(r.detection.confident)}",
        "",
        "Evidence:",
        "",
        *[f"- {e}" for e in r.detection.evidence],
        "",
        "## 6. Relationships (foreign keys)",
        "",
        *([f"- `{rel}`" for rel in r.relationships] or ["- none"]),
        "",
        "## 7. Source mapping (column roles used by later phases)",
        "",
        "Roles are inferred from column names and types; see `reports/source_mapping.json`.",
        "",
        _mapping_section(r.mapping) if r.mapping else "_No mapping: auction or lot table not identified._",
        "",
        f"## 8. Tables in `{r.schema}`",
        "",
    ]
    out += [_table_section(t) for t in r.tables]
    return "\n".join(out) + "\n"
