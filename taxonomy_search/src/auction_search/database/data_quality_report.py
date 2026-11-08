"""Markdown rendering for the data-quality report and the representative lot samples."""

from __future__ import annotations

from auction_search.database.data_quality import DataQualityReport, SampleSet
from auction_search.reporting import md_table, pct, truncate

MAX_CATEGORY_ROWS = 250


def render_data_quality_markdown(r: DataQualityReport) -> str:
    scope = f"first {r.lot_limit:,} lots by primary key" if r.lot_limit else "all lots"
    out = [
        "# Initial data quality report",
        "",
        f"- Generated: {r.generated_at}",
        f"- Target: `{r.target}`",
        f"- Tables: auctions `{r.schema}.{r.auction_table}`, lots `{r.schema}.{r.lot_table}`",
        f"- Scope: {scope} — **{r.lots_analysed:,} lots analysed**",
        f"- Lots whose auction is missing (orphans): {r.orphan_lots}",
        "- Mode: read-only; no data was modified.",
        "",
        "## 1. Auctions",
        "",
    ]
    a = r.auctions
    out += [
        md_table(
            ["Measure", "Value"],
            [
                ("Auctions", f"{a.auctions:,}"),
                ("Auctions with lots (in scope)", a.auctions_with_lots),
                ("Auctions without lots (in scope)", a.auctions_without_lots),
                ("Lots per auction (min / median / avg / max)",
                 f"{a.lots_per_auction['min']} / {a.lots_per_auction['median']} / "
                 f"{a.lots_per_auction['avg']} / {a.lots_per_auction['max']}"),
                ("Distinct auction houses", a.auction_houses_distinct),
            ],
        ),
        "",
    ]
    if a.date_ranges:
        out += [md_table(["Date column", "Earliest", "Latest", "Nulls"],
                         [(f"`{d['column']}`", d["min"], d["max"], d["nulls"]) for d in a.date_ranges]), ""]
    if a.top_auction_houses:
        out += ["Top auction houses:", "",
                md_table(["Auction house", "Auctions"], [(h["auction_house"], h["auctions"]) for h in a.top_auction_houses]),
                ""]

    out += ["## 2. Null and blank values", ""]
    for table, profiles in r.column_profiles.items():
        rows_total = r.lots_analysed if table == r.lot_table else a.auctions
        out += [
            f"### `{table}`",
            "",
            md_table(
                ["Column", "Role", "Nulls", "Blank ('')", "Missing %", "Distinct"],
                [
                    (f"`{p.column}`", p.role + (f" ({p.language})" if p.language else ""), p.nulls,
                     "" if p.blanks is None else p.blanks, pct(p.nulls + (p.blanks or 0), rows_total),
                     "" if p.distinct is None else f"{p.distinct:,}")
                    for p in profiles
                ],
            ),
            "",
        ]

    out += [
        "## 3. Title and description lengths (characters, non-empty values)",
        "",
        md_table(
            ["Table.column", "Non-empty", "Min", "P10", "Median", "P90", "Max", "Avg", "< 20 chars"],
            [(f"`{x.table}.{x.column}`", f"{x.non_empty:,}", x.min, x.p10, x.median, x.p90, x.max, x.avg,
              x.shorter_than_20) for x in r.lengths],
        ),
        "",
        "## 4. Duplicates",
        "",
        md_table(["Check", "Duplicate groups", "Rows involved"],
                 [(d.check, f"{d.groups:,}", f"{d.rows:,}") for d in r.duplicates]),
        "",
    ]
    for d in r.duplicates:
        if d.examples:
            out += [f"Most repeated — {d.check}:", ""]
            out += [f"- {truncate(', '.join(f'{k}={v}' for k, v in e.items()), 220)}" for e in d.examples]
            out += [""]

    out += [
        "### Text hygiene",
        "",
        md_table(
            ["Column", "Check", "Rows", "% of non-empty"],
            [(f"`{h.column}`", h.check, f"{h.rows:,}", pct(h.rows, h.non_empty)) for h in r.hygiene],
        ),
        "",
        "## 5. Languages",
        "",
        "### French / English field coverage",
        "",
        md_table(
            ["Table", "Field", "Rows", "Both FR+EN", "FR only", "EN only", "Neither", "FR identical to EN"],
            [(p.table, p.role, f"{p.rows:,}", f"{p.both:,} ({pct(p.both, p.rows)})", p.only.get("fr"),
              p.only.get("en"), p.neither, f"{p.identical:,} ({pct(p.identical, p.rows)})")
             for p in r.language_pairs],
        ),
        "",
        "### Detected language of field content",
        "",
        "Heuristic function-word detector (`auction_search.text.language`). `unknown` = too short or "
        "ambiguous (e.g. an artist's name alone).",
        "",
        md_table(
            ["Table.column", "Declared", "Sampled", "Detected languages"],
            [(f"`{c.table}.{c.column}`", c.declared, f"{c.sampled:,}",
              ", ".join(f"{k}: {v:,} ({pct(v, c.sampled)})" for k, v in c.detected.items()))
             for c in r.language_checks],
        ),
        "",
    ]
    for c in r.language_checks:
        if c.mismatch_examples:
            out += [f"Examples where `{c.column}` content does not look like `{c.declared}`:", ""]
            out += [f"- id {e['id']} → {e['detected']}: {truncate(str(e['text']), 140)}" for e in c.mismatch_examples]
            out += [""]

    if r.categories:
        cs = r.categories
        langs = [k for k in cs.columns]
        out += [
            "## 6. Source categories",
            "",
            "Columns: " + ", ".join(f"`{v}` ({k})" for k, v in cs.columns.items()),
            "",
            "Distinct values: " + ", ".join(f"{k}: {v}" for k, v in cs.distinct.items()),
            f" — lots with no category: {cs.uncategorised:,} ({pct(cs.uncategorised, r.lots_analysed)})",
            "",
        ]
        if cs.inconsistent_translations:
            out += ["Categories whose translation is not one-to-one:", ""]
            out += [md_table(list(cs.inconsistent_translations[0].keys()),
                             [list(x.values()) for x in cs.inconsistent_translations[:30]]), ""]
        shown = cs.categories[:MAX_CATEGORY_ROWS]
        out += [
            f"All category pairs ({len(cs.categories)}; showing {len(shown)}):",
            "",
            md_table([*langs, "Lots", "% of lots"],
                     [[*(c.get(x) for x in langs), c["lots"], pct(c["lots"], r.lots_analysed)] for c in shown]),
            "",
        ]

    out += ["## 7. Collection status and errors", ""]
    for col, values in r.status_values.items():
        out += [f"- `{col}`: " + ", ".join(f"{v['value']}={v['rows']:,}" for v in values)]
    for col, n in r.error_counts.items():
        out += [f"- `{col}` non-empty: {n:,}"]
    out += [
        "",
        "## 8. Query timings (seconds)",
        "",
        md_table(["Step", "Seconds"], list(r.timings_seconds.items())),
        "",
    ]
    return "\n".join(out) + "\n"


def render_samples_markdown(s: SampleSet) -> str:
    out = [
        "# Representative lot samples",
        "",
        f"- Generated: {s.generated_at}",
        f"- Grouped by `{s.category_column}`, up to {s.samples_per_category} lots per category, chosen "
        "deterministically (ordered by md5 of the lot primary key) so reruns give the same sample.",
        "- Full texts are in `lot_samples.json`; descriptions are truncated here.",
        "",
    ]
    d = s.display
    titles: dict[str, str] = d.get("titles") or {}  # type: ignore[assignment]
    descriptions: dict[str, str] = d.get("descriptions") or {}  # type: ignore[assignment]
    languages = sorted(set(titles) | set(descriptions), key=lambda x: (x != "fr", x != "en", x))

    def field(row: dict[str, object], key: object) -> str:
        return "" if key is None or row.get(key) is None else str(row.get(key))  # type: ignore[arg-type]

    current = None
    for row in s.samples:
        if row["sample_category"] != current:
            current = row["sample_category"]
            out += ["", f"## {current} ({row['category_size']:,} lots)", ""]
        out.append(
            f"- **Lot {field(row, d.get('lot_number'))}** (pk {field(row, d.get('pk'))}, "
            f"auction {field(row, d.get('auction_key'))}, {field(row, d.get('auction_date'))})"
        )
        for lang in languages:
            title = truncate(field(row, titles.get(lang)), 120)
            desc = truncate(field(row, descriptions.get(lang)), 200)
            out.append(f"  - {lang.upper()}: {title} — {desc}")
    return "\n".join(out) + "\n"
