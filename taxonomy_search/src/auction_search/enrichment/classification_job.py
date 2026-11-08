"""Batch classification of all lots (Phase 4) and the classification quality report.

Incremental: a lot is reclassified only when its text (content hash), the taxonomy (fingerprint) or
the classifier version changed since ``lot_classification_state`` was written — or with ``force``.
Each batch is committed on its own, so an interrupted run simply continues next time (``--resume``
is the default behaviour). Rows written by people (``method = 'manual'``) are never touched.
"""

from __future__ import annotations

import json
import logging
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Connection, Engine, text

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource, SourceLot
from auction_search.enrichment.classification import (
    CLASSIFIER_VERSION,
    CULTURE_CATEGORIES,
    Classifier,
    LotClassification,
)
from auction_search.reporting import md_table, pct, truncate
from auction_search.taxonomy.snapshot import TaxonomySnapshot

log = logging.getLogger(__name__)


@dataclass
class ClassificationStats:
    started_at: str
    taxonomy_scope: str
    taxonomy_fingerprint: str
    classifier_version: str = CLASSIFIER_VERSION
    lots_seen: int = 0
    unchanged_skipped: int = 0
    classified: int = 0
    assertions_written: int = 0
    needs_review: int = 0
    by_assertion: dict[str, int] = field(default_factory=dict)
    by_method: dict[str, int] = field(default_factory=dict)
    review_reasons: dict[str, int] = field(default_factory=dict)
    seconds: float = 0.0
    dry_run: bool = False
    ai_tokens_used: int = 0


def _state(conn: Connection, schema: str) -> dict[int, tuple[str, str, str]]:
    return {r[0]: (r[1], r[2], r[3]) for r in conn.execute(text(
        f'select lot_id, content_hash, taxonomy_fingerprint, classifier_version from "{schema}".lot_classification_state'))}


def _write(conn: Connection, schema: str, snap: TaxonomySnapshot, results: list[LotClassification]) -> int:
    s = f'"{schema}"'
    ids = [r.lot.lot_id for r in results]
    conn.execute(text(f"delete from {s}.lot_concepts where lot_id = any(:ids) "
                      f"and method in ('rule', 'source_category')"), {"ids": ids})
    rows = [
        {"lot": r.lot.lot_id, "src": r.lot.source, "sid": r.lot.source_lot_id, "cid": snap.concepts[a.concept_key].id,
         "dim": a.dimension, "assertion": a.assertion, "conf": a.confidence, "method": a.method,
         "field": a.source_field, "evidence": json.dumps({"quote": a.quote[:300], "position": a.position},
                                                         ensure_ascii=False),
         "hash": r.lot.content_hash(), "vid": snap.version_id}
        for r in results for a in r.assertions if a.concept_key in snap.concepts
    ]
    if rows:
        conn.execute(text(
            f"insert into {s}.lot_concepts (lot_id, source, source_lot_id, concept_id, concept_dimension, assertion, "
            f"confidence, method, source_field, evidence, content_hash, taxonomy_version_id) values (:lot, :src, :sid, "
            f":cid, :dim, :assertion, :conf, :method, :field, cast(:evidence as jsonb), :hash, :vid) "
            f"on conflict do nothing"), rows)
    conn.execute(text(
        f"insert into {s}.lot_classification_state as st (lot_id, source, source_lot_id, content_hash, "
        f"taxonomy_fingerprint, taxonomy_scope, classifier_version, assertions, needs_review, review_reasons, "
        f"classified_at) values (:lot, :src, :sid, :hash, :fp, :scope, :ver, :n, :review, :reasons, now()) "
        f"on conflict (lot_id) do update set content_hash = excluded.content_hash, "
        f"taxonomy_fingerprint = excluded.taxonomy_fingerprint, taxonomy_scope = excluded.taxonomy_scope, "
        f"classifier_version = excluded.classifier_version, assertions = excluded.assertions, "
        f"needs_review = excluded.needs_review, review_reasons = excluded.review_reasons, classified_at = now()"),
        [{"lot": r.lot.lot_id, "src": r.lot.source, "sid": r.lot.source_lot_id, "hash": r.lot.content_hash(),
          "fp": snap.fingerprint, "scope": snap.scope, "ver": CLASSIFIER_VERSION, "n": len(r.assertions),
          "review": r.needs_review, "reasons": r.reasons} for r in results])
    return len(rows)


def run_classification(engine: Engine, schema: str, structure: StructureReport, snap: TaxonomySnapshot,
                       limit: int | None = None, batch_size: int = 500, force: bool = False, dry_run: bool = False,
                       only_lots: set[int] | None = None) -> ClassificationStats:
    stats = ClassificationStats(datetime.now(timezone.utc).isoformat(timespec="seconds"), snap.scope,
                                snap.fingerprint, dry_run=dry_run)
    classifier = Classifier(snap)
    source = LotSource(structure)
    by_assertion: Counter[str] = Counter()
    by_method: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    t0 = time.perf_counter()
    with engine.connect() as read_conn:
        state = _state(read_conn, schema)
        for batch in source.iter_batches(read_conn, batch_size=batch_size, limit=limit):
            todo: list[SourceLot] = []
            for lot in batch:
                stats.lots_seen += 1
                if only_lots is not None and lot.lot_id not in only_lots:
                    continue
                current = (lot.content_hash(), snap.fingerprint, CLASSIFIER_VERSION)
                if not force and state.get(lot.lot_id) == current:
                    stats.unchanged_skipped += 1
                    continue
                todo.append(lot)
            results = [classifier.classify(lot) for lot in todo]
            for r in results:
                stats.classified += 1
                stats.needs_review += r.needs_review
                for a in r.assertions:
                    by_assertion[a.assertion] += 1
                    by_method[a.method] += 1
                for reason in r.reasons:
                    reasons[reason.split(":")[0].split(" (")[0]] += 1
            if results and not dry_run:
                with engine.begin() as write_conn:
                    stats.assertions_written += _write(write_conn, schema, snap, results)
            log.info("batch classified", extra={"last_lot_id": batch[-1].lot_id, "classified": stats.classified})
    stats.by_assertion = dict(by_assertion.most_common())
    stats.by_method = dict(by_method.most_common())
    stats.review_reasons = dict(reasons.most_common())
    stats.seconds = round(time.perf_counter() - t0, 2)
    return stats


# --------------------------------------------------------------------------------------
# Quality report (computed from the database, so it describes all classified lots)
# --------------------------------------------------------------------------------------


def quality_figures(conn: Connection, schema: str, snap: TaxonomySnapshot, sample_size: int = 25) -> dict[str, Any]:
    s = f'"{schema}"'
    q = lambda sql, **p: conn.execute(text(sql), p)  # noqa: E731
    lots = q(f"select count(*) from {s}.lot_classification_state").scalar_one()
    review = q(f"select count(*) from {s}.lot_classification_state where needs_review").scalar_one()
    by_dim = dict(q(f"select concept_dimension || ' / ' || assertion, count(*) from {s}.lot_concepts "
                    f"group by 1 order by 2 desc").all())
    text_object = q(f"select count(distinct lot_id) from {s}.lot_concepts where method = 'rule' "
                    f"and assertion = 'classified_as'").scalar_one()
    # Agreement between the object type found in the text and the Drouot category (an independent,
    # human-assigned signal): same top-level category?
    # Same comparison as the review flag: the object named in the title (else the lead) against the
    # Drouot category, leaving out culture departments ("Asian art" vases are decorative arts too).
    pairs = q(f"select lc.lot_id, c.concept_key, lc.method, lc.evidence->>'position' from {s}.lot_concepts lc "
              f"join {s}.taxonomy_concepts c on c.id = lc.concept_id where lc.assertion = 'classified_as'").all()
    tops: dict[int, dict[str, set[str]]] = {}
    for lot_id, key, method, position in pairs:
        top = snap.top_category(key)
        if top and not (method == "source_category" and top in CULTURE_CATEGORIES):
            tops.setdefault(lot_id, {}).setdefault(position if method == "rule" else "category", set()).add(top)
    both = [(v.get("title") or v.get("lead"), v["category"]) for v in tops.values()
            if (v.get("title") or v.get("lead")) and v.get("category")]
    agree = sum(1 for text_tops, category_tops in both if text_tops & category_tops)
    attributions = dict(q(f"select assertion, count(*) from {s}.lot_concepts where assertion in "
                          f"('attributed_to','workshop_of','circle_of','follower_of','after') group by 1").all())
    reasons = dict(q(f"select split_part(split_part(r, ':', 1), ' (', 1), count(*) from {s}.lot_classification_state, "
                     f"unnest(review_reasons) r group by 1 order by 2 desc").all())

    def lots_with(key: str, assertion: str) -> list[int]:
        return [r[0] for r in q(f"select lc.lot_id from {s}.lot_concepts lc join {s}.taxonomy_concepts c "
                                f"on c.id = lc.concept_id where c.concept_key = :k and lc.assertion = :a "
                                f"order by 1", k=key, a=assertion)]

    footwear_keys = sorted(k for k in snap.concepts if k == "fashion.footwear" or k.startswith("fashion.footwear."))
    footwear = {k: len(lots_with(k, "classified_as")) for k in footwear_keys}
    sample = q(
        f"select st.lot_id, st.needs_review, st.review_reasons, (select string_agg(c.concept_key || ' ' || lc.assertion "
        f"|| ' ' || lc.confidence || ' [' || (lc.evidence->>'position') || ']', '; ' order by lc.confidence desc) "
        f"from {s}.lot_concepts lc join {s}.taxonomy_concepts c on c.id = lc.concept_id where lc.lot_id = st.lot_id) "
        f"from {s}.lot_classification_state st order by md5(st.lot_id::text) limit :n", n=sample_size).all()
    return {
        "lots_classified": lots, "needs_review": review, "assertions_by_dimension": by_dim,
        "lots_with_text_object_type": text_object, "lots_with_both_object_sources": len(both),
        "text_and_category_agree": agree, "attributions": attributions, "review_reasons": reasons,
        "louis_xiv": {"dated_to_period": lots_with("period.louis_xiv", "dated_to"),
                      "in_style_of_style": lots_with("style.louis_xiv", "in_style_of")},
        "footwear_classified_lots": footwear,
        "sample": [{"lot_id": r[0], "needs_review": r[1], "reasons": list(r[2]), "assertions": r[3] or ""}
                   for r in sample],
    }


def render_classification_markdown(stats: ClassificationStats, fig: dict[str, Any]) -> str:
    lots = fig["lots_classified"]
    out = [
        "# Lot classification quality (Phase 4, rules only)",
        "",
        f"- Last run: {stats.started_at}; classifier {stats.classifier_version}; taxonomy scope **{stats.taxonomy_scope}**"
        + (" — the taxonomy is not reviewed yet, so every classification is provisional" if stats.taxonomy_scope == "draft" else ""),
        f"- This run: {stats.lots_seen:,} lots seen, {stats.classified:,} classified, {stats.unchanged_skipped:,} "
        f"unchanged and skipped, {stats.assertions_written:,} assertions written, {stats.seconds} s, AI tokens 0"
        + (" (dry run, nothing written)" if stats.dry_run else ""),
        f"- In the database: **{lots:,} lots classified**, {fig['needs_review']:,} flagged for review "
        f"({pct(fig['needs_review'], lots)})",
        "",
        "## Assertions by dimension",
        "",
        md_table(["Dimension / assertion", "Rows"], list(fig["assertions_by_dimension"].items())),
        "",
        "## Quality checks",
        "",
        f"- Lots whose **text** names an object type: {fig['lots_with_text_object_type']:,} ({pct(fig['lots_with_text_object_type'], lots)}); "
        "the rest rely on the Drouot category only.",
        f"- Where the title (else the opening lines) names an object and the Drouot category is not a culture "
        f"department ({fig['lots_with_both_object_sources']:,} lots), they agree on the top-level category in "
        f"**{fig['text_and_category_agree']:,}** ({pct(fig['text_and_category_agree'], fig['lots_with_both_object_sources'])}). "
        "Disagreements are flagged ('Drouot category and text disagree') — they are either false positives in the "
        "text or miscategorised lots (e.g. spurs in *Chaussures*).",
        "- Uncertain attributions (maker assertions short of 'made by'): "
        + (", ".join(f"{k} {v}" for k, v in fig["attributions"].items()) or "none"),
        "",
        "Reasons for review:",
        "",
        md_table(["Reason", "Lots"], list(fig["review_reasons"].items())),
        "",
        "## Validation targets",
        "",
        f"- Louis XIV: `dated_to period.louis_xiv` → lots {fig['louis_xiv']['dated_to_period']}; "
        f"`in_style_of style.louis_xiv` → lots {fig['louis_xiv']['in_style_of_style']}.",
        "- Footwear `classified_as` lots: " + ", ".join(f"`{k}` {v}" for k, v in fig["footwear_classified_lots"].items()),
        "",
        "## Representative sample (deterministic) for manual inspection",
        "",
        md_table(["Lot", "Review", "Assertions (concept, assertion, confidence, position)"],
                 [(s["lot_id"], ", ".join(s["reasons"]) if s["needs_review"] else "",
                   truncate(s["assertions"], 400)) for s in fig["sample"]]),
        "",
    ]
    return "\n".join(out) + "\n"
