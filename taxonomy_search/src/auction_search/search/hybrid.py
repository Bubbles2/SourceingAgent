"""Hybrid search over the Drouot lots: taxonomy + full-text + semantic (Phase 6).

Workflow for one query:

1. **Understand** it (concept groups, period/style intent, leftover words) and **expand** it with the
   taxonomy (synonyms, translations, narrower concepts; related concepts in exploratory mode).
2. **Taxonomy channel** — lots with an assertion (not a mere mention) on a group's concepts or their
   descendants ("shoes" → boots, sandals…). Period groups match ``dated_to``, style groups ``in_style_of``.
3. **Keyword channel** — PostgreSQL full-text search (french/english configurations) for each group's
   expanded terms, and for each leftover word.
4. **Semantic channel** (broad, exploratory) — nearest lots by embedding (pgvector HNSW).
5. **Merge** with reciprocal rank fusion. A lot is a **direct** match when every group (and every
   leftover word) is matched by the taxonomy or by keywords; everything else found — partial matches,
   semantic-only neighbours, related concepts — is a **related suggestion**. Each hit explains itself.

Modes: ``exact`` (taxonomy + keywords on the concepts' own labels; direct matches only), ``broad``
(default: + narrower terms, semantic neighbours), ``exploratory`` (+ related concepts: style↔period,
associated techniques, revivals…).
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy import Engine, text

from auction_search.search.expansion import EXACT_RELATIONSHIPS, ExpansionPlan, QueryExpander
from auction_search.search.index import fold
from auction_search.search.understanding import Understanding
from auction_search.taxonomy.snapshot import TaxonomySnapshot

log = logging.getLogger(__name__)

MODES = ("exact", "broad", "exploratory")
RRF_K = 60
WEIGHTS = {"taxonomy": 1.0, "keyword": 0.8, "semantic": 0.7, "related": 0.3}
SEMANTIC_LIMIT = 200
KEYWORD_LIMIT = 3000
# Keywords per idea and language in the keyword channel (most important first: labels, then the nearest
# sub-types). The taxonomy channel already finds classified lots of every sub-type; checking and ranking
# thousands of lots against 50+ words costs ~120 ms per idea for little gain (measured 2026-11-08).
KEYWORD_TERMS = 10
# In broad/exploratory modes these only boost ranking: "French" is often implied (a Louis XV armchair),
# and leftover adjectives ("antique", "vintage", "designer") are vague. Exact mode requires everything.
SOFT_DIMENSIONS = frozenset({"region", "word"})


@dataclass
class SearchHit:
    lot_id: int
    source_lot_id: str
    auction_id: str | None
    title: str
    excerpt: str
    auction_date: str | None
    url: str | None
    match_type: str              # direct | related
    score: float
    explanation: list[str]


@dataclass
class SearchResponse:
    query: str
    mode: str
    language: str
    taxonomy_scope: str
    understanding: dict[str, Any]
    direct: list[SearchHit] = field(default_factory=list)
    related: list[SearchHit] = field(default_factory=list)
    total_direct: int = 0
    total_related: int = 0
    channel_counts: dict[str, int] = field(default_factory=dict)
    took_ms: int = 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class _Group:
    label: str
    keys: list[str]                       # concepts (with descendants) — empty for a leftover word
    dimension: str
    fr_terms: list[str]
    en_terms: list[str]
    hard: bool = True                     # required for a direct match (soft groups only boost the score)


class HybridSearch:
    def __init__(self, engine: Engine, schema: str, snap: TaxonomySnapshot, embedder: Any | None = None,
                 log_engine: Engine | None = None) -> None:
        self.engine, self.schema, self.snap = engine, schema, snap
        self.expander = QueryExpander(snap)
        self.embedder = embedder
        self.log_engine = log_engine
        self.s = f'"{schema}"'

    # ---- groups --------------------------------------------------------------------

    def _groups(self, u: Understanding, plan: ExpansionPlan, mode: str) -> list[_Group]:
        groups = []
        for g in u.groups:
            keys = set(g.keys)
            for k in g.keys:
                keys |= self.snap.descendants(k)
            allowed = EXACT_RELATIONSHIPS if mode == "exact" else EXACT_RELATIONSHIPS | {"narrower"}
            terms = [q for q in plan.queries if q.concept in keys and q.relationship in allowed and not q.combined]
            if not terms:  # e.g. an ambiguous term whose labels were not expanded
                terms = []
            fr = ([q.term for q in terms if q.language in ("fr", "und")] or [g.text])[:KEYWORD_TERMS]
            en = ([q.term for q in terms if q.language in ("en", "und")] or [g.text])[:KEYWORD_TERMS]
            groups.append(_Group(g.text, sorted(keys), g.dimension, fr, en, hard=mode == "exact" or g.dimension
                                 not in SOFT_DIMENSIONS))
        for word in u.unresolved:
            groups.append(_Group(word, [], "word", [word], [word], hard=mode == "exact"))
        if groups and not any(g.hard for g in groups):  # only vague words: they are what was asked
            for g in groups:
                g.hard = True
        return groups

    # ---- channels ------------------------------------------------------------------

    def _taxonomy(self, conn: Any, keys: list[str]) -> dict[int, tuple[float, list[str]]]:
        if not keys:
            return {}
        rows = conn.execute(text(
            f"select lc.lot_id, max(lc.confidence), string_agg(distinct c.concept_key || ' ' || lc.assertion, ', ') "
            f"from {self.s}.lot_concepts lc join {self.s}.taxonomy_concepts c on c.id = lc.concept_id "
            f"where c.concept_key = any(:keys) and lc.assertion <> 'mentions' group by lc.lot_id"),
            {"keys": keys}).all()
        return {r[0]: (float(r[1]), [r[2]]) for r in rows}

    def _keyword(self, conn: Any, fr_terms: list[str], en_terms: list[str]) -> dict[int, float]:
        params: dict[str, Any] = {}
        parts = []
        for lang, config, terms in (("fr", "french", fr_terms), ("en", "english", en_terms)):
            folded = [fold(t) for t in terms if fold(t)]
            if not folded:
                continue
            q = " || ".join(f"phraseto_tsquery('{config}', :{lang}{i})" for i in range(len(folded)))
            params.update({f"{lang}{i}": t for i, t in enumerate(folded)})
            parts.append((lang, q))
        if not parts:
            return {}
        where = " or ".join(f"tsv_{lang} @@ ({q})" for lang, q in parts)
        rank = " + ".join(f"ts_rank_cd(tsv_{lang}, ({q}))" for lang, q in parts)
        rows = conn.execute(text(f"select lot_id, {rank} from {self.s}.lot_search_documents where {where} "
                                 f"order by 2 desc limit {KEYWORD_LIMIT}"), params).all()
        return {r[0]: float(r[1]) for r in rows}

    def _semantic(self, conn: Any, query: str) -> dict[int, float]:
        if self.embedder is None:
            return {}
        vec = "[" + ",".join(f"{x:.6f}" for x in self.embedder.encode_query(query)) + "]"
        rows = conn.execute(text(
            f"select lot_id, 1 - (embedding <=> cast(:v as public.vector)) from {self.s}.lot_embeddings "
            f"where model = :m order by embedding <=> cast(:v as public.vector) limit {SEMANTIC_LIMIT}"),
            {"v": vec, "m": self.embedder.spec.name}).all()
        return {r[0]: float(r[1]) for r in rows}

    @staticmethod
    def content_words(query: str) -> str:
        """The query without search noise ('Find auctions selling shoes' → 'shoes'): a fairer baseline."""
        from auction_search.search.understanding import NOISE

        return " ".join(w for w in query.split() if fold(w) not in NOISE) or query

    def keyword_baseline(self, query: str, limit: int = 50) -> list[int]:
        """Plain full-text search on the raw query (all words required) — the comparison baseline."""
        q = fold(query)
        with self.engine.connect() as conn:
            rows = conn.execute(text(
                f"select lot_id from {self.s}.lot_search_documents where tsv_fr @@ websearch_to_tsquery('french', :q) "
                f"or tsv_en @@ websearch_to_tsquery('english', :q) order by ts_rank_cd(tsv_fr, "
                f"websearch_to_tsquery('french', :q)) + ts_rank_cd(tsv_en, websearch_to_tsquery('english', :q)) desc, "
                f"lot_id limit :n"), {"q": q, "n": limit}).all()
        return [r[0] for r in rows]

    # ---- search --------------------------------------------------------------------

    def search(self, query: str, mode: str = "broad", limit: int = 20, language: str = "all",
               log_query: bool = True, channels: frozenset[str] = frozenset({"taxonomy", "keyword", "semantic"})
               ) -> SearchResponse:
        """``channels`` switches channels off for evaluation (e.g. taxonomy only); normal use keeps all."""
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        t0 = time.perf_counter()
        u = self.expander.understand(query)
        plan = self.expander.expand(query, language=language, depth=mode, max_queries=80, understanding=u)
        groups = self._groups(u, plan, mode)

        tax_by_group: list[dict[int, tuple[float, list[str]]]] = []
        kw_by_group: list[dict[int, float]] = []
        related: dict[int, list[str]] = defaultdict(list)
        with self.engine.connect() as conn:
            for g in groups:
                tax_by_group.append(self._taxonomy(conn, list(g.keys)) if "taxonomy" in channels else {})
                kw_by_group.append(self._keyword(conn, g.fr_terms, g.en_terms) if "keyword" in channels else {})
            semantic = self._semantic(conn, query) if mode != "exact" and "semantic" in channels else {}
            if mode == "exploratory":
                rel_keys = {q.concept: q.relationship for q in plan.queries
                            if q.concept and q.relationship.startswith(("related", "broader", "revival", "revived",
                                                                         "technique", "named", "eponym", "typical"))}
                for key, rel in rel_keys.items():
                    for lot_id in self._taxonomy(conn, [key]):
                        related[lot_id].append(f"related concept {key} ({rel})")
            if not groups:  # nothing understood: plain keywords
                kw_by_group.append({lot: 1.0 for lot in self.keyword_baseline(query, KEYWORD_LIMIT)})
                groups.append(_Group(query, [], "word", [query], [query]))
                tax_by_group.append({})

        # Per-lot coverage and channel scores
        candidates: set[int] = set(semantic) | set(related)
        for t, k in zip(tax_by_group, kw_by_group):
            candidates |= set(t) | set(k)
        n_groups = sum(g.hard for g in groups)
        n_soft = len(groups) - n_groups
        info: dict[int, dict[str, Any]] = {}
        for lot in candidates:
            covered, soft, tax_score, kw_score, why = 0, 0, 0.0, 0.0, []
            for g, t, k in zip(groups, tax_by_group, kw_by_group):
                hit = False
                if lot in t:
                    hit = True
                    tax_score += t[lot][0]
                    why.append(f"taxonomy: {t[lot][1][0]}")
                if lot in k:
                    hit = True
                    kw_score += k[lot]
                    if lot not in t:
                        why.append(f"keyword: '{g.label}'")
                if g.hard:
                    covered += hit
                else:
                    soft += hit
            if lot in semantic:
                why.append(f"semantic similarity {semantic[lot]:.2f}")
            why += related.get(lot, [])
            info[lot] = {"covered": covered, "soft": soft, "tax": tax_score, "kw": kw_score, "why": why}

        def ranks(score: dict[int, float]) -> dict[int, int]:
            ordered = sorted((lot for lot, v in score.items() if v > 0), key=lambda lot: (-score[lot], lot))
            return {lot: i + 1 for i, lot in enumerate(ordered)}

        r_tax = ranks({lot: i["covered"] * 10 + i["soft"] * 3 + i["tax"] for lot, i in info.items() if i["tax"] > 0})
        r_kw = ranks({lot: i["covered"] * 10 + i["soft"] * 3 + i["kw"] for lot, i in info.items() if i["kw"] > 0})
        r_sem = ranks(semantic)
        r_rel = ranks({lot: 1.0 for lot in related})
        scores = {}
        for lot, i in info.items():
            s = sum(WEIGHTS[ch] / (RRF_K + r[lot]) for ch, r in (("taxonomy", r_tax), ("keyword", r_kw),
                                                                  ("semantic", r_sem), ("related", r_rel)) if lot in r)
            scores[lot] = (s + 0.01 * (i["covered"] / n_groups if n_groups else 0)
                           + 0.005 * (i["soft"] / n_soft if n_soft else 0))
        direct_ids = sorted((lot for lot, i in info.items() if n_groups and i["covered"] == n_groups),
                            key=lambda lot: (-scores[lot], lot))
        related_ids = [] if mode == "exact" else sorted(
            (lot for lot, i in info.items() if not (n_groups and i["covered"] == n_groups)),
            key=lambda lot: (-scores[lot], lot))

        resp = SearchResponse(
            query, mode, u.language, self.snap.scope,
            {"concepts": [{"text": g.text, "concepts": g.keys, "dimension": g.dimension, "via": g.via}
                          for g in u.groups], "intent": u.intent, "unresolved_terms": u.unresolved,
             "expansions": [q.term for q in plan.queries[:12]]},
            total_direct=len(direct_ids), total_related=len(related_ids),
            channel_counts={"taxonomy": len(r_tax), "keyword": len(r_kw), "semantic": len(semantic),
                            "related_concepts": len(related)})
        resp.direct = self._hits(direct_ids[:limit], "direct", scores, info, u.language)
        resp.related = self._hits(related_ids[:limit], "related", scores, info, u.language)
        resp.took_ms = int((time.perf_counter() - t0) * 1000)
        if log_query:
            self._log(resp, u)
        return resp

    def _hits(self, ids: list[int], kind: str, scores: dict[int, float], info: dict[int, dict[str, Any]],
              language: str) -> list[SearchHit]:
        if not ids:
            return []
        with self.engine.connect() as conn:
            rows = {r.lot_id: r for r in conn.execute(text(
                f"select lot_id, source_lot_id, auction_key, title_fr, title_en, lead_fr, lead_en, auction_date, lot_url "
                f"from {self.s}.lot_search_documents where lot_id = any(:ids)"), {"ids": ids})}
        hits = []
        for lot in ids:
            r = rows.get(lot)
            if r is None:
                continue
            title = (r.title_en if language == "en" and r.title_en else r.title_fr) or r.title_en or ""
            lead = (r.lead_en if language == "en" and r.lead_en else r.lead_fr) or ""
            hits.append(SearchHit(lot, r.source_lot_id, r.auction_key, title, lead[:220],
                                  r.auction_date.isoformat() if r.auction_date else None, r.lot_url, kind,
                                  round(scores[lot], 5), info[lot]["why"]))
        return hits

    def _log(self, resp: SearchResponse, u: Understanding) -> None:
        if self.log_engine is None:
            return
        try:
            with self.log_engine.begin() as conn:
                conn.execute(text(
                    f"insert into {self.s}.search_queries (query, language, mode, concepts, unresolved_terms, "
                    f"results, direct_results, took_ms) values (:q, :l, :m, :c, :u, :r, :d, :t)"),
                    {"q": resp.query, "l": resp.language, "m": resp.mode, "c": u.concepts, "u": u.unresolved,
                     "r": resp.total_direct + resp.total_related, "d": resp.total_direct, "t": resp.took_ms})
        except Exception as exc:  # logging must never break a search
            log.warning("query not logged", extra={"error": str(exc).splitlines()[0]})
