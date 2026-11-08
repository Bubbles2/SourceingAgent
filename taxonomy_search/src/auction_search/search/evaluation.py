"""Search evaluation (Phase 9): benchmark queries, relevance labels, systems, metrics, analysis.

Labels: the rules in ``data/benchmark/queries.yaml`` (Drouot category + text patterns, written before
any system was run) give **provisional** relevance for every lot. Where
``data/benchmark/human_labels.csv`` has a judgement (query_id, lot_id, relevant), it overrides the
rule. The pooled top results of all systems are written to ``judgements_to_review.csv`` for that.

Systems compared, all over the same 20,923 lots:

* ``keyword_raw`` — PostgreSQL full-text search on the query as typed (all words required).
* ``keyword_content`` — the same without search noise words ("find", "auctions selling").
* ``semantic_only`` — nearest lots by embedding.
* ``taxonomy_only`` — the taxonomy channel of the hybrid engine, alone.
* ``hybrid_exact`` / ``hybrid_broad`` — the hybrid engine (direct matches first, then related).

Metrics per query, averaged: precision@10, recall@50 (relevant found in the top 50 divided by
min(relevant, 50) so that large relevant sets do not cap it), nDCG@10 (binary), MRR, latency.
Costs: no AI tokens and no external API calls are used by any system; embeddings run locally.
"""

from __future__ import annotations

import csv
import math
import re
import statistics
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import Engine, text

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource, SourceLot
from auction_search.enrichment.text import clean
from auction_search.reporting import md_table, pct, truncate
from auction_search.search.hybrid import HybridSearch

BENCHMARK_DIR = Path(__file__).resolve().parents[3] / "data" / "benchmark"
SYSTEMS = ("keyword_raw", "keyword_content", "semantic_only", "taxonomy_only", "hybrid_exact", "hybrid_broad")
TOP_K = 50


@dataclass
class QuerySpec:
    id: str
    query: str
    language: str
    rule: dict[str, Any]


@dataclass
class QueryResult:
    system: str
    query_id: str
    ranked: list[int]
    ms: float
    metrics: dict[str, float] = field(default_factory=dict)


def load_queries(path: Path = BENCHMARK_DIR / "queries.yaml") -> list[QuerySpec]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return [QuerySpec(q["id"], q["query"], q.get("language", "en"), q["relevant"]) for q in data["queries"]]


def _texts(lot: SourceLot) -> tuple[str, str]:
    titles = " ".join(clean(lot.title.get(lang)) for lang in ("fr", "en"))
    body = titles + " " + " ".join(clean(lot.description.get(lang)) for lang in ("fr", "en"))
    return titles, body


def rule_matches(rule: dict[str, Any], lot: SourceLot, titles: str, body: str) -> bool:
    if "categories" in rule and (lot.category.get("fr") or "") not in rule["categories"]:
        return False
    if "text" in rule and not re.search(rule["text"], body, re.IGNORECASE):
        return False
    if "title" in rule and not re.search(rule["title"], titles, re.IGNORECASE):
        return False
    if "any" in rule and not any(rule_matches(r, lot, titles, body) for r in rule["any"]):
        return False
    return True


def relevant_sets(queries: list[QuerySpec], lots: list[SourceLot],
                  human: dict[tuple[str, int], bool]) -> dict[str, set[int]]:
    texts = {lot.lot_id: _texts(lot) for lot in lots}
    out = {}
    for q in queries:
        rel = {lot.lot_id for lot in lots if rule_matches(q.rule, lot, *texts[lot.lot_id])}
        for (qid, lot_id), ok in human.items():
            if qid == q.id:
                (rel.add if ok else rel.discard)(lot_id)
        out[q.id] = rel
    return out


def load_human_labels(path: Path = BENCHMARK_DIR / "human_labels.csv") -> dict[tuple[str, int], bool]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return {(r["query_id"], int(r["lot_id"])): r["relevant"].strip() in ("1", "yes", "oui", "true")
                for r in csv.DictReader(fh) if r.get("relevant", "").strip()}


def metrics(ranked: list[int], relevant: set[int]) -> dict[str, float]:
    top10, top50 = ranked[:10], ranked[:TOP_K]
    hits10 = [1 if lot in relevant else 0 for lot in top10]
    dcg = sum(h / math.log2(i + 2) for i, h in enumerate(hits10))
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(relevant), 10)))
    first = next((i + 1 for i, lot in enumerate(ranked) if lot in relevant), None)
    return {
        "precision@10": sum(hits10) / 10,
        "recall@50": (sum(1 for lot in top50 if lot in relevant) / min(len(relevant), TOP_K)) if relevant else 0.0,
        "ndcg@10": dcg / ideal if ideal else 0.0,
        "mrr": 1 / first if first else 0.0,
        "returned": float(len(ranked)),
    }


def run_system(name: str, engine: HybridSearch, q: QuerySpec) -> QueryResult:
    t0 = time.perf_counter()
    if name == "keyword_raw":
        ranked = engine.keyword_baseline(q.query, TOP_K)
    elif name == "keyword_content":
        ranked = engine.keyword_baseline(engine.content_words(q.query), TOP_K)
    elif name == "semantic_only":
        resp = engine.search(q.query, mode="broad", limit=TOP_K, log_query=False, channels=frozenset({"semantic"}))
        ranked = [h.lot_id for h in resp.direct + resp.related]
    elif name == "taxonomy_only":
        resp = engine.search(q.query, mode="broad", limit=TOP_K, log_query=False, channels=frozenset({"taxonomy"}))
        ranked = [h.lot_id for h in resp.direct + resp.related]
    elif name == "hybrid_exact":
        resp = engine.search(q.query, mode="exact", limit=TOP_K, log_query=False)
        ranked = [h.lot_id for h in resp.direct]
    else:
        resp = engine.search(q.query, mode="broad", limit=TOP_K, log_query=False)
        ranked = [h.lot_id for h in resp.direct + resp.related]
    return QueryResult(name, q.id, ranked[:TOP_K], round((time.perf_counter() - t0) * 1000, 1))


@dataclass
class Evaluation:
    queries: list[QuerySpec]
    relevant: dict[str, set[int]]
    results: list[QueryResult]
    human_labels: int
    summary: dict[str, dict[str, float]] = field(default_factory=dict)
    analysis: dict[str, Any] = field(default_factory=dict)


def evaluate(engine: HybridSearch, db: Engine, structure: StructureReport, systems: tuple[str, ...] = SYSTEMS,
             queries: list[QuerySpec] | None = None) -> Evaluation:
    queries = queries or load_queries()
    with db.connect() as conn:
        lots = [lot for batch in LotSource(structure).iter_batches(conn, batch_size=2000) for lot in batch]
    human = load_human_labels()
    relevant = relevant_sets(queries, lots, human)
    results = []
    for q in queries:
        for s in systems:
            r = run_system(s, engine, q)
            r.metrics = metrics(r.ranked, relevant[q.id])
            results.append(r)
    ev = Evaluation(queries, relevant, results, len(human))
    for s in systems:
        rs = [r for r in results if r.system == s]
        ev.summary[s] = {m: round(statistics.mean(r.metrics[m] for r in rs), 3)
                         for m in ("precision@10", "recall@50", "ndcg@10", "mrr")}
        lat = sorted(r.ms for r in rs)
        ev.summary[s] |= {"mean_ms": round(statistics.mean(lat), 1),
                          "p95_ms": lat[min(len(lat) - 1, int(0.95 * len(lat)))],
                          "zero_result_queries": sum(1 for r in rs if not r.ranked)}
    ev.analysis = _analysis(engine, ev, lots)
    return ev


def _analysis(engine: HybridSearch, ev: Evaluation, lots: list[SourceLot]) -> dict[str, Any]:
    """Missing concepts (words the taxonomy did not understand) and concepts behind wrong direct hits."""
    by_id = {lot.lot_id: lot for lot in lots}
    unresolved: Counter[str] = Counter()
    wrong_concepts: Counter[str] = Counter()
    missed_examples: dict[str, list[str]] = {}
    for q in ev.queries:
        resp = engine.search(q.query, mode="broad", limit=10, log_query=False)
        unresolved.update(resp.understanding["unresolved_terms"])
        for h in resp.direct:
            if h.lot_id not in ev.relevant[q.id]:
                for why in h.explanation:
                    if why.startswith("taxonomy: "):
                        for part in why[len("taxonomy: "):].split(", "):
                            wrong_concepts[part.split(" ")[0]] += 1
        hybrid = next((r for r in ev.results if r.query_id == q.id and r.system == "hybrid_broad"), None)
        found_ids = set(hybrid.ranked) if hybrid else set()
        missed = [lot_id for lot_id in sorted(ev.relevant[q.id]) if lot_id not in found_ids][:3]
        missed_examples[q.id] = [f"{lot_id}: {truncate(clean(by_id[lot_id].title.get('fr')), 70)}" for lot_id in missed]
    return {"unresolved_terms": dict(unresolved.most_common()),
            "concepts_in_wrong_direct_hits": dict(wrong_concepts.most_common(15)),
            "missed_relevant_examples": missed_examples}


def write_judgement_pool(ev: Evaluation, lots_titles: dict[int, tuple[str, str]], path: Path) -> int:
    """Top 10 of every system per query, for a human to label (relevant = 1/0)."""
    rows = []
    for q in ev.queries:
        pool: dict[int, list[str]] = {}
        for r in ev.results:
            if r.query_id == q.id:
                for lot_id in r.ranked[:10]:
                    pool.setdefault(lot_id, []).append(r.system)
        for lot_id, systems in sorted(pool.items()):
            fr, en = lots_titles.get(lot_id, ("", ""))
            rows.append({"query_id": q.id, "query": q.query, "lot_id": lot_id, "found_by": " ".join(systems),
                         "rule_label": int(lot_id in ev.relevant[q.id]), "title_fr": fr, "title_en": en,
                         "relevant": ""})
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def render_evaluation_markdown(ev: Evaluation, scope: str, pool_rows: int) -> str:
    s = ev.summary
    best = max(s, key=lambda k: s[k]["ndcg@10"])
    rows = [(f"`{name}`", m["precision@10"], m["recall@50"], m["ndcg@10"], m["mrr"], m["zero_result_queries"],
             m["mean_ms"], m["p95_ms"]) for name, m in s.items()]
    per_query = []
    for q in ev.queries:
        cells = [q.id, truncate(q.query, 40), len(ev.relevant[q.id])]
        for name in s:
            r = next(r for r in ev.results if r.system == name and r.query_id == q.id)
            cells.append(f"{r.metrics['precision@10']:.1f}/{r.metrics['ndcg@10']:.2f}")
        per_query.append(cells)
    a = ev.analysis
    base = s.get("keyword_content", {})
    hyb = s.get("hybrid_broad", {})
    return "\n".join([
        "# Search evaluation (Phase 9)", "",
        f"- {len(ev.queries)} queries (French and English); taxonomy scope `{scope}`"
        + (" — the taxonomy is the unreviewed draft, so these are provisional results" if scope == "draft" else ""),
        "- **Labels are provisional rules** (Drouot category + text patterns, written before running the systems), "
        f"not human judgements. Human labels applied: {ev.human_labels}. A pool of {pool_rows} results to judge is "
        "in `data/benchmark/judgements_to_review.csv`.",
        "- Costs: 0 AI tokens and 0 external API calls for every system; embeddings are computed locally.", "",
        "## Results (mean over queries)", "",
        md_table(["System", "P@10", "R@50", "nDCG@10", "MRR", "Queries with no result", "Mean ms", "p95 ms"], rows), "",
        f"Best nDCG@10: **{best}**. Hybrid (broad) vs keyword on content words: P@10 {base.get('precision@10')} → "
        f"{hyb.get('precision@10')}, R@50 {base.get('recall@50')} → {hyb.get('recall@50')}, nDCG@10 "
        f"{base.get('ndcg@10')} → {hyb.get('ndcg@10')}; latency {base.get('mean_ms')} ms → {hyb.get('mean_ms')} ms.", "",
        "## Per query (P@10 / nDCG@10)", "",
        md_table(["Id", "Query", "Relevant lots", *s.keys()], per_query), "",
        "## Analysis", "",
        "Words the taxonomy did not understand (candidates for new concepts or synonyms): "
        + (", ".join(f"`{k}` ({v})" for k, v in a["unresolved_terms"].items()) or "none"), "",
        "Concepts behind direct hits judged not relevant by the rules (check their terms and relationships): "
        + (", ".join(f"`{k}` ({v})" for k, v in a["concepts_in_wrong_direct_hits"].items()) or "none"), "",
        "Examples of relevant lots hybrid search did not return in its top 50:", "",
        *[f"- {qid}: " + ("; ".join(v) or "none") for qid, v in a["missed_relevant_examples"].items()], "",
    ]) + "\n"
