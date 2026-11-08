"""Benchmark multilingual embedding models on the real lots (Phase 5).

Two tasks, both run on **French-only** document text so that success means crossing languages:

* **A — translation retrieval**: each sampled lot's *English title* is a query; the right answer is
  the same lot's *French* title + description start among all sampled French documents.
  Metrics: recall@1, recall@10, mean reciprocal rank (MRR).
* **B — English questions over all French lots**: natural English queries; a hit is a lot whose
  Drouot category (assigned by the auction house, independent of this project) is relevant.
  Metric: precision@10.

Also measured: model load time, encoding speed, vector size and estimated storage.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sqlalchemy import Engine

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource, SourceLot
from auction_search.embeddings.generator import Embedder, lot_text
from auction_search.enrichment.text import clean
from auction_search.reporting import md_table

# English query -> relevant Drouot categories (category_fr). Written before looking at any results.
ENGLISH_QUERIES: list[tuple[str, set[str]]] = [
    ("pair of women's shoes", {"Chaussures"}),
    ("Louis XV chest of drawers", {"Commodes"}),
    ("Chinese porcelain vase", {"Arts d'Asie", "Vases", "Céramiques"}),
    ("diamond engagement ring", {"Bagues"}),
    ("landscape oil painting", {"Tableaux anciens", "Tableaux modernes", "Tableaux contemporains", "Tableaux"}),
    ("silver cutlery set", {"Ménagères et Couverts", "Argenterie"}),
    ("Swiss automatic wristwatch", {"Montres", "Montres et horlogerie"}),
    ("gold coin", {"Pièces et billets"}),
    ("Persian rug", {"Tapis"}),
    ("bronze animal sculpture", {"Bronzes", "Sculptures"}),
    ("luxury leather handbag", {"Sacs à main"}),
    ("antique bookcase", {"Bibliothèques"}),
    ("crystal chandelier", {"Lustres"}),
    ("cavalry sword", {"Armes", "Armes, militaria, souvenirs historiques"}),
    ("Russian orthodox icon", {"Icônes"}),
    ("vintage advertising poster", {"Affiches"}),
]


@dataclass
class ModelResult:
    model: str
    dims: int
    device: str
    load_seconds: float
    docs_per_second: float
    task_a: dict[str, float]
    task_b: dict[str, Any]
    storage_mb_for_all_lots: float
    notes: list[str] = field(default_factory=list)


def _sample(lots: list[SourceLot], n: int) -> list[SourceLot]:
    usable = [lot for lot in lots if len(clean(lot.title.get("en")).split()) >= 4
              and clean(lot.title.get("en")) != clean(lot.title.get("fr")) and clean(lot.description.get("fr"))]
    usable.sort(key=lambda lot: hashlib.md5(str(lot.lot_id).encode()).hexdigest())
    return usable[:n]


def benchmark(engine: Engine, structure: StructureReport, model_names: list[str], sample_size: int = 1000,
              ) -> tuple[list[ModelResult], dict[str, Any]]:
    with engine.connect() as conn:
        lots = [lot for batch in LotSource(structure).iter_batches(conn, batch_size=2000) for lot in batch]
    sample = _sample(lots, sample_size)
    fr_all = [lot_text(lot, ("fr",)) for lot in lots]
    categories = [lot.category.get("fr") for lot in lots]
    meta = {"lots": len(lots), "task_a_sample": len(sample), "queries": len(ENGLISH_QUERIES)}

    results = []
    for name in model_names:
        emb = Embedder(name)
        # Task A
        docs = emb.encode_documents([lot_text(lot, ("fr",)) for lot in sample])
        queries = np.stack([emb.encode_query(clean(lot.title.get("en"))) for lot in sample])
        sims = queries @ docs.T
        ranks = (sims > np.diag(sims)[:, None]).sum(axis=1)  # 0 = correct document ranked first
        task_a = {"recall@1": round(float((ranks == 0).mean()), 3), "recall@10": round(float((ranks < 10).mean()), 3),
                  "mrr": round(float((1.0 / (ranks + 1)).mean()), 3)}
        # Task B (all lots) — also gives the encoding speed
        t0 = time.perf_counter()
        all_docs = emb.encode_documents(fr_all, batch_size=128)
        speed = len(fr_all) / (time.perf_counter() - t0)
        per_query = []
        for q, relevant in ENGLISH_QUERIES:
            scores = all_docs @ emb.encode_query(q)
            top = np.argsort(-scores)[:10]
            hits = sum(1 for i in top if categories[i] in relevant)
            per_query.append({"query": q, "precision@10": hits / 10,
                              "top3": [f"{lots[i].lot_id}: {clean(lots[i].title.get('fr'))[:60]}" for i in top[:3]]})
        task_b = {"mean_precision@10": round(float(np.mean([p["precision@10"] for p in per_query])), 3),
                  "per_query": per_query}
        results.append(ModelResult(name, emb.spec.dims, emb.device, emb.load_seconds, round(speed, 1), task_a, task_b,
                                   round(len(lots) * emb.spec.dims * 4 / 1e6, 1)))
        del emb
    return results, meta


def choose(results: list[ModelResult]) -> ModelResult:
    """Best combined score; ties go to the faster model."""
    return max(results, key=lambda r: (r.task_a["mrr"] + r.task_b["mean_precision@10"], r.docs_per_second))


def render_benchmark_markdown(results: list[ModelResult], meta: dict[str, Any], chosen: ModelResult) -> str:
    out = [
        "# Embedding model benchmark (Phase 5)",
        "",
        f"- Lots: {meta['lots']:,}; task A sample: {meta['task_a_sample']:,} lots; task B: {meta['queries']} English "
        "queries over **French-only** text of all lots. Models run locally; AI tokens: 0.",
        f"- **Chosen: `{chosen.model}`** (best combined task A MRR + task B precision@10).",
        "",
        md_table(["Model", "Dims", "Device", "Load s", "Docs/s", "A recall@1", "A recall@10", "A MRR", "B precision@10",
                  "Vector storage (all lots)"],
                 [(f"`{r.model}`", r.dims, r.device, r.load_seconds, r.docs_per_second, r.task_a["recall@1"],
                   r.task_a["recall@10"], r.task_a["mrr"], r.task_b["mean_precision@10"],
                   f"{r.storage_mb_for_all_lots} MB") for r in results]),
        "",
        "Task A: an English title must find its own French description among the sample. "
        "Task B: share of the top 10 French lots whose Drouot category is relevant to the English query "
        "(the category is assigned by the auction house, so it is an independent but coarse judge).",
        "",
    ]
    for r in results:
        out += [f"## `{r.model}` — English queries", "",
                md_table(["Query", "P@10", "Top 3 French lots"],
                         [(p["query"], p["precision@10"], " · ".join(p["top3"])) for p in r.task_b["per_query"]]), ""]
    return "\n".join(out) + "\n"
