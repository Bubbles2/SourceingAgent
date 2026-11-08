"""External search orchestration (Phase 8).

1. Interpret the query and turn it into search criteria with the taxonomy (``criteria_for``): one
   list of French/English keywords per idea, e.g. (Louis XIV words) AND (furniture words).
2. Per provider and language, build the requests its API can take (``build_requests``): AND of
   OR-lists when it supports both, combined phrases ("Commodes Louis XIV") otherwise; at most
   ``max_requests``, each within the provider's maximum length.
3. Execute (rate-limited, retried, paginated by the adapter); a failing request is recorded and the
   others continue.
4. Normalise (adapters return ``ExternalLot``) and deduplicate: same provider id, then the same
   normalised title + auction date across providers.
5. Validate each lot against the query's concept groups using the taxonomy on the lot's own text:
   **direct** when every required group is confirmed, otherwise **related**.
6. Record, per provider and expansion, how many results and direct matches it produced
   (``auction_search.external_search_log``) — which expansions are worth sending to which provider.

External results are never written to the taxonomy: this module has no taxonomy write path.
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy import Engine, text

from auction_search.config import Settings
from auction_search.enrichment.text import lemma, tokens
from auction_search.external.base import AuctionProvider, ExternalLot, ProviderError
from auction_search.search.criteria import MAX_TERMS_PER_GROUP, criteria_for
from auction_search.search.expansion import QueryExpander
from auction_search.search.understanding import Understanding
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.snapshot import TaxonomySnapshot

log = logging.getLogger(__name__)

SOFT = {"region"}
MAX_REQUESTS = 6  # per provider and language


@dataclass
class ExternalSearchResult:
    query: str
    depth: str
    taxonomy_scope: str
    concepts: list[str]
    criteria: dict[str, Any] = field(default_factory=dict)
    requests: list[dict[str, Any]] = field(default_factory=list)      # exactly what was sent, per provider
    expansions: list[dict[str, Any]] = field(default_factory=list)
    providers: list[dict[str, Any]] = field(default_factory=list)
    direct: list[ExternalLot] = field(default_factory=list)
    related: list[ExternalLot] = field(default_factory=list)
    took_ms: int = 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class ExternalSearchOrchestrator:
    def __init__(self, providers: dict[str, AuctionProvider], expander: QueryExpander, snap: TaxonomySnapshot,
                 log_engine: Engine | None = None, schema: str = "auction_search") -> None:
        self.providers, self.expander, self.snap = providers, expander, snap
        self.log_engine, self.schema = log_engine, schema

    # ---- validation -----------------------------------------------------------------

    def _confirm(self, lot: ExternalLot, u: Understanding) -> None:
        body = f"{lot.title} {lot.description}"
        toks = tokens(body)
        found: set[str] = set()
        for lang in ("fr", "en"):
            for entries, _, _ in self.snap.gazetteer.find(lang, toks):
                found |= {e.concept_key for e in entries if not e.ambiguous}
        expanded = found | {a for k in found for a in self.snap.ancestors(k)}
        words = set(lemma(normalize_term(body)).split())
        hard = soft = hard_ok = soft_ok = 0
        for g in u.groups:
            ok = bool(set(g.keys) & expanded)
            if g.dimension in SOFT:
                soft, soft_ok = soft + 1, soft_ok + ok
            else:
                hard, hard_ok = hard + 1, hard_ok + ok
            lot.validation.append(f"{'confirmed' if ok else 'missing'}: {g.text} ({', '.join(g.keys[:2])})")
        for w in u.unresolved:
            ok = lemma(w) in words
            soft, soft_ok = soft + 1, soft_ok + ok
            lot.validation.append(f"{'has' if ok else 'lacks'} word '{w}'")
        lot.coverage = (hard_ok / hard) if hard else (soft_ok / soft if soft else 1.0)
        lot.score = round(lot.coverage + 0.2 * (soft_ok / soft if soft else 0) + 0.05 * len(lot.found_by), 4)

    # ---- search ---------------------------------------------------------------------

    def search(self, query: str, language: str = "all", depth: str = "broad",
               max_queries: int = MAX_TERMS_PER_GROUP, providers: list[str] | None = None, limit: int = 20,
               max_requests: int = MAX_REQUESTS) -> ExternalSearchResult:
        """``max_queries``: keywords per idea and language; ``max_requests``: per provider and language."""
        t0 = time.perf_counter()
        u = self.expander.understand(query)
        criteria = criteria_for(self.expander, query, language=language, depth=depth,
                                max_terms_per_group=max_queries, understanding=u)
        result = ExternalSearchResult(query, depth, self.snap.scope, u.concepts,
                                      criteria=criteria.as_dict())
        names = providers or list(self.providers)
        for name in names:
            if name not in self.providers:
                raise KeyError(name)

        lots: dict[tuple[str, str], ExternalLot] = {}
        stats: dict[tuple[str, str], dict[str, Any]] = {}
        for name in names:
            provider = self.providers[name]
            for lang in provider.capabilities.languages:
                if lang not in criteria.languages:
                    continue
                info = criteria.term_info(lang)
                for request in provider.build_requests(criteria, lang, max_requests):
                    error = None
                    try:
                        items = provider.search(request.query, lang)
                    except ProviderError as exc:
                        items, error = [], str(exc)
                        log.warning("provider request failed", extra={"provider": name, "query": request.query})
                    result.requests.append({"provider": name, "language": lang, "query": request.query,
                                            "results": len(items), "error": error})
                    for term in request.terms:
                        t = info.get(term)
                        s = stats.setdefault((name, term), {"provider": name, "term": term, "language": lang,
                                                            "relationship": t.relationship if t else "keyword",
                                                            "priority": t.priority if t else 1,
                                                            "results": 0, "lots": set(), "error": None})
                        s["results"] += len(items)
                        s["lots"] |= {(it.provider, it.external_id) for it in items}
                        s["error"] = s["error"] or error
                    for it in items:
                        key = (it.provider, it.external_id)
                        lot = lots.setdefault(key, it)
                        # Credit only the keywords whose words the lot contains.
                        words = set(lemma(normalize_term(f"{it.title} {it.description}")).split())
                        credited = [t for t in request.terms if set(lemma(normalize_term(t)).split()) <= words]
                        lot.found_by = sorted(set(lot.found_by) | set(credited or request.terms[:1]))
            result.providers.append(provider.describe() | {"results": sum(
                r["results"] for r in result.requests if r["provider"] == name)})

        # Cross-provider duplicates: same normalised title and auction date.
        unique: dict[str, ExternalLot] = {}
        for lot in lots.values():
            fp = f"{normalize_term(lot.title)[:80]}|{lot.auction_date or ''}"
            if fp in unique:
                keep = unique[fp]
                keep.duplicates.append(f"{lot.provider}:{lot.external_id}")
                keep.found_by = sorted(set(keep.found_by) | set(lot.found_by))
            else:
                unique[fp] = lot
        for lot in unique.values():
            self._confirm(lot, u)
        hard_groups = any(g.dimension not in SOFT for g in u.groups)
        direct = [lot for lot in unique.values() if lot.coverage == 1.0 and (hard_groups or not u.groups)]
        related = [lot for lot in unique.values() if lot not in direct]
        result.direct = sorted(direct, key=lambda x: (-x.score, x.provider, x.external_id))[:limit]
        result.related = sorted(related, key=lambda x: (-x.score, x.provider, x.external_id))[:limit]
        direct_keys = {(x.provider, x.external_id) for x in direct}
        result.expansions = [{k: v for k, v in s.items() if k != "lots"} | {"direct_matches": len(s["lots"] & direct_keys)}
                             for s in stats.values()]
        result.took_ms = int((time.perf_counter() - t0) * 1000)
        self._log(result)
        return result

    def _log(self, result: ExternalSearchResult) -> None:
        if self.log_engine is None or not result.expansions:
            return
        try:
            with self.log_engine.begin() as conn:
                conn.execute(text(
                    f'insert into "{self.schema}".external_search_log (provider, query, expansion_term, relationship, '
                    f"priority, results, direct_matches, error) values (:provider, :q, :term, :relationship, :priority, "
                    f":results, :direct_matches, :error)"),
                    [e | {"q": result.query} for e in
                     ({k: e[k] for k in ("provider", "term", "relationship", "priority", "results", "direct_matches",
                                         "error")} for e in result.expansions)])
        except Exception as exc:  # logging must never break a search
            log.warning("external search not logged", extra={"error": str(exc).splitlines()[0]})


def default_orchestrator(snap: TaxonomySnapshot, expander: QueryExpander, ro_engine: Engine, rw_engine: Engine | None,
                         settings: Settings) -> ExternalSearchOrchestrator:
    """Providers available without credentials: the mock catalogue and the local Drouot data."""
    from auction_search.external.local_provider import LocalDatabaseProvider
    from auction_search.external.mock_provider import MockProvider

    providers: dict[str, AuctionProvider] = {"mock": MockProvider(),
                                             "local_drouot": LocalDatabaseProvider(ro_engine, settings.app_schema)}
    return ExternalSearchOrchestrator(providers, expander, snap, rw_engine, settings.app_schema)
