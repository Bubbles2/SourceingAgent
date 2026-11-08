"""Taxonomy validation report (Markdown + JSON) written by ``validate-taxonomy``."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from auction_search.reporting import md_table
from auction_search.taxonomy.scenarios import ExampleLot, ScenarioResult
from auction_search.taxonomy.seed import Issue


@dataclass
class TaxonomyValidationReport:
    generated_at: str
    seed_path: str
    seed_statistics: dict[str, Any]
    seed_issues: list[Issue]
    sandbox_schema: str | None = None
    sandbox_left_behind: bool | None = None
    load_inserted: dict[str, int] = field(default_factory=dict)
    load_updated_on_reload: dict[str, int] = field(default_factory=dict)
    database_issues: list[Issue] = field(default_factory=list)
    example_lots: dict[str, ExampleLot | None] = field(default_factory=dict)
    scenarios: list[ScenarioResult] = field(default_factory=list)
    database_statistics: dict[str, Any] = field(default_factory=dict)

    @property
    def errors(self) -> int:
        return sum(i.level == "error" for i in [*self.seed_issues, *self.database_issues])

    @property
    def failed_scenarios(self) -> int:
        return sum(s.status == "failed" for s in self.scenarios)


def render_taxonomy_markdown(r: TaxonomyValidationReport) -> str:
    st = r.seed_statistics
    out = [
        "# Taxonomy validation report",
        "",
        f"- Generated: {r.generated_at}",
        f"- Seed: `{r.seed_path}` (version {st['version']})",
        f"- Result: **{r.errors} error(s), {r.failed_scenarios} failed scenario(s)**",
        "",
        "## 1. Seed contents",
        "",
        md_table(["Measure", "Value"], [
            ("Concepts", st["concepts"]),
            *[(f"  {dim}", n) for dim, n in st["concepts_by_dimension"].items()],
            ("Terms", st["terms"]),
            ("  by language", ", ".join(f"{k}: {v}" for k, v in st["terms_by_language"].items())),
            ("  by type", ", ".join(f"{k}: {v}" for k, v in st["terms_by_type"].items())),
            ("  flagged ambiguous", st["ambiguous_terms"]),
            ("Relationships", st["relationships"]),
            *[(f"  {k}", v) for k, v in st["relationships_by_type"].items()],
            ("Drouot source categories mapped", f"{st['source_categories']} ({st['source_category_mappings']} mappings)"),
        ]),
        "",
        "## 2. Offline validation of the seed file",
        "",
    ]
    levels = {lvl: [i for i in r.seed_issues if i.level == lvl] for lvl in ("error", "warning", "info")}
    out.append(f"{len(levels['error'])} error(s), {len(levels['warning'])} warning(s), {len(levels['info'])} note(s).")
    out.append("")
    for lvl in ("error", "warning", "info"):
        out += [f"- **{lvl}**: {i.message}" for i in levels[lvl]]
    out.append("")

    if r.sandbox_schema is None:
        out += ["## 3. Database sandbox", "", "_Not run (use `validate-taxonomy --sandbox`)._", ""]
        return "\n".join(out) + "\n"

    out += [
        "## 3. Database sandbox",
        "",
        f"Migration `0001` was applied to a temporary schema `{r.sandbox_schema}` inside one transaction, the seed was "
        "loaded, the scenarios below were run, and the transaction was **rolled back**. "
        f"Sandbox schema still present afterwards: **{'yes' if r.sandbox_left_behind else 'no'}**. "
        "`auction_search` and `drouot_collector` were not modified.",
        "",
        md_table(["Loaded", "Inserted", "Updated on a second load (idempotence)"],
                 [(k, v, r.load_updated_on_reload.get(k, 0)) for k, v in r.load_inserted.items()]),
        "",
        f"Database checks (cycles, missing FR/EN labels): {len(r.database_issues)} issue(s).",
        *[f"- **{i.level}**: {i.message}" for i in r.database_issues],
        "",
        "## 4. Scenarios",
        "",
    ]
    for key, lot in r.example_lots.items():
        if lot:
            out.append(f"- Example lot ({key}): `drouot_collector.lots.id = {lot.lot_id}` "
                       f"({lot.source}/{lot.source_lot_id}) — «{lot.title_fr}»")
    out.append("")
    groups: dict[str, list[ScenarioResult]] = {}
    for s in r.scenarios:
        groups.setdefault(s.group, []).append(s)
    for group, items in groups.items():
        out += [f"### {group}", "",
                md_table(["Result", "Scenario", "Evidence"],
                         [("✅ passed" if s.status == "passed" else ("⏭ skipped" if s.status == "skipped" else "❌ failed"),
                           s.name, s.detail) for s in items]),
                ""]
    ds = r.database_statistics
    if ds:
        out += ["## 5. Sandbox database after loading", "",
                md_table(["Measure", "Value"], [
                    ("Versions", ", ".join(f"{v['label']} ({v['status']})" for v in ds["versions"])),
                    ("Concepts by dimension", ", ".join(f"{k}: {v}" for k, v in ds["concepts_by_dimension"].items())),
                    ("Terms by language", ", ".join(f"{k}: {v}" for k, v in ds["terms_by_language"].items())),
                    ("Relationships by type", ", ".join(f"{k}: {v}" for k, v in ds["relationships_by_type"].items())),
                    ("Source category mappings", ds["source_category_mappings"]),
                    ("Published views (end of run)", ", ".join(f"{k}: {v}" for k, v in ds["published"].items())),
                ]), ""]
    return "\n".join(out) + "\n"
