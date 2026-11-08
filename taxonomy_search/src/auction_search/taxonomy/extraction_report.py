"""Taxonomy extraction report (Phase 3): run statistics, candidates, attestation, validation targets."""

from __future__ import annotations

from collections import Counter
from dataclasses import asdict
from typing import Any

from auction_search.enrichment.extraction import LotExtraction
from auction_search.reporting import md_table, pct, truncate
from auction_search.taxonomy.builder import Attestation, BuildResult
from auction_search.taxonomy.importer import ImportResult

DIMENSION_ORDER = ["object_type", "period", "style", "maker", "material", "technique", "region"]
LOUIS_ERA = ["louis_xiii", "louis_xiv", "regence", "louis_xv", "louis_xvi", "napoleon_iii"]


def validation_targets(build: BuildResult, records: list[LotExtraction]) -> dict[str, Any]:
    """Footwear and Louis XIV checks requested for Phase 3, computed from the real lots."""
    att = {a.concept_key: a for a in build.attested}
    categories = {r.lot_id: r.category_fr for r in records}

    footwear_keys = sorted(k for k in att if k == "fashion.footwear" or k.startswith("fashion.footwear."))
    unambiguous: dict[int, set[str]] = {}
    for r in records:
        for m in r.mentions:
            if m.concept_key in footwear_keys and not m.ambiguous:
                unambiguous.setdefault(r.lot_id, set()).add(m.concept_key)
    shoes_category = sorted(i for i, c in categories.items() if c == "Chaussures")
    covered = [i for i in shoes_category if i in unambiguous]
    footwear_candidates = [c for c in build.candidates
                           if (c.broader or "").startswith("fashion.footwear") or c.key.startswith("fashion.footwear.")]
    footwear = {
        "concepts": [_row(att[k]) for k in footwear_keys],
        "shoes_category_lots": len(shoes_category),
        "shoes_category_lots_with_unambiguous_footwear_term": len(covered),
        "shoes_category_lots_without": [i for i in shoes_category if i not in unambiguous],
        "lots_with_unambiguous_footwear_term": len(unambiguous),
        "of_which_outside_shoes_category": sum(1 for i in unambiguous if categories.get(i) != "Chaussures"),
        "new_candidates": [{"key": c.key, "label_fr": c.label_fr, "label_en": c.label_en, "lots": c.lots}
                           for c in footwear_candidates],
    }

    def lots(key: str) -> set[int]:
        return set(att[key].lot_ids) if key in att else set()

    period, style, boulle = lots("period.louis_xiv"), lots("style.louis_xiv"), lots("technique.boulle_marquetry")
    louis = {
        "era": [{"name": name, "period_lots": len(lots(f"period.{name}")), "style_lots": len(lots(f"style.{name}")),
                 "both": len(lots(f"period.{name}") & lots(f"style.{name}"))} for name in LOUIS_ERA],
        "period_louis_xiv": _row(att["period.louis_xiv"]) if "period.louis_xiv" in att else None,
        "style_louis_xiv": _row(att["style.louis_xiv"]) if "style.louis_xiv" in att else None,
        "boulle_marquetry": _row(att["technique.boulle_marquetry"]) if "technique.boulle_marquetry" in att else None,
        "boulle_with_louis_xiv_period": sorted(boulle & period),
        "boulle_with_louis_xiv_style": sorted(boulle & style),
        "related_candidates": [{"key": c.key, "label_fr": c.label_fr, "label_en": c.label_en, "lots": c.lots,
                                "relationships": c.relationships}
                               for c in build.candidates if c.dimension in ("period", "style")
                               and ("louis" in c.lemma or "regence" in c.lemma or "empire" in c.lemma)],
    }
    return {"footwear": footwear, "louis_xiv": louis}


def _row(a: Attestation) -> dict[str, Any]:
    return {"concept": a.concept_key, "lots": a.lots, "ambiguous_lots": a.ambiguous_lots, "auctions": a.auctions,
            "top_categories": a.top_categories[:3], "en_labels": a.en_labels, "en_alignment": a.en_alignment,
            "examples": [f"lot {e.lot_id}: {e.quote}" for e in a.evidence[:3]]}


def render_extraction_markdown(stats: dict[str, Any], build: BuildResult, validation: dict[str, Any],
                               imported: ImportResult | None, import_mode: str) -> str:
    cands = build.candidates
    by_dim = Counter(c.dimension for c in cands)
    out = [
        "# Taxonomy extraction report (Phase 3, rules only)",
        "",
        f"- Generated: {build.generated_at}",
        f"- Lots read: **{stats.get('lots_processed', build.lots):,}** of {stats.get('lots_total_in_source', '?'):,} "
        f"in the source; extractor version {stats.get('extractor_version')}",
        f"- Extraction time: {stats.get('seconds')} s (newly extracted {stats.get('extracted', 0):,}, cache hits "
        f"{stats.get('cache_hits', 0):,}, identical texts reused {stats.get('duplicate_content_reused', 0):,})",
        "- **AI tokens used: 0** — every step is deterministic (patterns, lexicons, alignment statistics).",
        "",
        "## 1. Extraction",
        "",
        "Fields skipped because their content is in another language than the column says: "
        + ", ".join(f"`{k}` {v:,}" for k, v in (stats.get("skipped_fields") or {}).items()),
        "",
        md_table(["Extractor", "Mentions (one per lot and term)"],
                 list((stats.get("mentions_by_extractor") or {}).items())),
        "",
        "## 2. Candidates",
        "",
        f"Grouped by dimension and lemma; kept when seen in at least {build.params['min_lots']} lots.",
        "",
        md_table(["Dimension", "Candidates kept", "Below the lot threshold"],
                 [(d, by_dim.get(d, 0), build.below_threshold.get(d, 0)) for d in DIMENSION_ORDER]),
        "",
        "Not proposed as new concepts:",
        "",
        *[f"- {reason}: {n:,}" for reason, n in sorted(build.dropped.items())],
        "",
    ]
    for dim in DIMENSION_ORDER:
        top = sorted((c for c in cands if c.dimension == dim), key=lambda c: (-c.lots, c.key))[:15]
        if not top:
            continue
        out += [f"### Top {dim} candidates", "",
                md_table(["Key", "French", "English (source)", "Lots", "Auctions", "Confidence", "Proposed parent"],
                         [(f"`{c.key}`", c.label_fr, f"{c.label_en or '—'} ({c.en_source or 'none'})", c.lots,
                           c.auctions, c.confidence, f"`{c.broader}`" if c.broader else "")
                          for c in top]), ""]

    attested = sorted(build.attested, key=lambda a: -a.lots)
    out += [
        "## 3. Existing concepts found in the lots",
        "",
        f"{len(attested)} existing concepts are attested by at least one lot. Top 25:",
        "",
        md_table(["Concept", "Lots", "of which ambiguous term only", "Top Drouot categories",
                  "English found by alignment", "English labels in taxonomy"],
                 [(f"`{a.concept_key}`", a.lots, a.ambiguous_lots,
                   ", ".join(f"{c} ({n})" for c, n in a.top_categories[:2]), a.en_alignment or "",
                   ", ".join(a.en_labels[:3])) for a in attested[:25]]),
        "",
        "## 4. Suggestions for reviewers (not imported)",
        "",
        f"- Possible spelling variants: {len(build.variant_suggestions)}",
        *[f"  - `{v['a']}` ≈ `{v['b']}` ({v['label_a']} / {v['label_b']}, similarity {v['ratio']})"
          for v in build.variant_suggestions[:15]],
        f"- Possible synonyms (French terms aligned to the same English term): {len(build.synonym_suggestions)}",
        *[f"  - {s['english']!r} ({s['dimension']}): " + ", ".join(f"`{k}`" for k in s["concepts"][:6])
          for s in build.synonym_suggestions[:15]],
        "",
    ]

    fw, lx = validation["footwear"], validation["louis_xiv"]
    out += [
        "## 5. Validation targets",
        "",
        "### Footwear",
        "",
        md_table(["Concept", "Lots", "Ambiguous-only lots", "Top categories", "English alignment", "Example"],
                 [(f"`{r['concept']}`", r["lots"], r["ambiguous_lots"],
                   ", ".join(f"{c} ({n})" for c, n in r["top_categories"]), r["en_alignment"] or "",
                   truncate(r["examples"][0], 110) if r["examples"] else "") for r in fw["concepts"]]),
        "",
        f"- Drouot category *Chaussures*: {fw['shoes_category_lots']} lots; "
        f"{fw['shoes_category_lots_with_unambiguous_footwear_term']} contain an unambiguous footwear term "
        f"({pct(fw['shoes_category_lots_with_unambiguous_footwear_term'], fw['shoes_category_lots'])}). "
        f"Without one: lots {', '.join(map(str, fw['shoes_category_lots_without'])) or 'none'}.",
        f"- {fw['lots_with_unambiguous_footwear_term']} lots contain an unambiguous footwear term; "
        f"{fw['of_which_outside_shoes_category']} of them are outside the *Chaussures* category "
        "(e.g. Chinese shoes in Asian art, shoes mentioned in paintings).",
        f"- New footwear candidates from extraction: {len(fw['new_candidates'])} "
        + (", ".join(f"{c['label_fr']} ({c['lots']})" for c in fw["new_candidates"]) or "— the vocabulary found in "
           "the lots is already in the seed; new words (e.g. 'tennis') occur in fewer lots than the threshold"),
        "",
        "### Louis XIV",
        "",
        md_table(["Reign", "Lots dated to the period", "Lots in the style", "Lots with both"],
                 [(e["name"], e["period_lots"], e["style_lots"], e["both"]) for e in lx["era"]]),
        "",
    ]
    for label, key in (("Louis XIV period", "period_louis_xiv"), ("Louis XIV style", "style_louis_xiv"),
                       ("Boulle marquetry", "boulle_marquetry")):
        r = lx[key]
        if r:
            out += [f"**{label}** — {r['lots']} lots ({r['ambiguous_lots']} through an ambiguous term only):", ""]
            out += [f"- {truncate(e, 200)}" for e in r["examples"]] + [""]
    out += [
        f"- Boulle marquetry together with the Louis XIV *period*: lots {lx['boulle_with_louis_xiv_period'] or 'none'}; "
        f"with the Louis XIV *style*: lots {lx['boulle_with_louis_xiv_style'] or 'none'}.",
        "- Related period/style candidates: "
        + (", ".join(f"{c['label_fr']} ({c['lots']})" for c in lx["related_candidates"]) or "none"),
        "",
        "## 6. Import into `auction_search`",
        "",
    ]
    if imported is None:
        out += ["_Not imported in this run._", ""]
    else:
        d = asdict(imported)
        skipped, totals = d.pop("skipped"), d.pop("version_totals")
        out += [f"Mode: **{import_mode}**. Draft version `{imported.version_label}`; all rows `candidate`, "
                "provenance `rule_extraction`.", "",
                md_table(["This run", "Value"], [(k, v) for k, v in d.items() if k not in ("version_id",)]), "",
                md_table([f"Version {imported.version_label} in the database after this run", "Rows"],
                         list(totals.items())), ""]
        out += [f"- skipped — {k}: {v}" for k, v in skipped.items()] + [""]
    return "\n".join(out) + "\n"
