"""HTTP API (Phases 6–8). Run with ``python -m auction_search.cli serve-api``.

Endpoints:

* ``GET  /api/health`` — database reachable, taxonomy scope, embedding model.
* ``POST /api/search`` — hybrid search: ``{"query", "mode": exact|broad|exploratory, "language", "limit"}``.
* ``POST /api/search/expand`` — query expansion: ``{"query", "language", "searchDepth", "maxQueries"}``.
* ``POST /api/search/external`` — search external providers with taxonomy expansions (Phase 8).
* ``POST /api/taxonomy/reload`` — reload the taxonomy after a review/publication.
* ``/api/admin/...`` — administration for the Sourcing agent's "Search" tab (``admin.py``).

The taxonomy scope is ``auto``: the published version, or the unreviewed draft while nothing is
published — every response says which (``taxonomyScope``).

**Access:** when ``TAXONOMY_SERVICE_TOKEN`` is set, every endpoint except ``/api/health`` needs the header
``X-Service-Token`` with that value (the Sourcing agent's back end sends it). The admin endpoints refuse to
run without a configured token. The service listens on 127.0.0.1 only (``serve-api --host``).
"""

from __future__ import annotations

import hmac
import logging
import re
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Engine, text

from auction_search.api.jobs import JobRunner
from auction_search.config import PROJECT_ROOT, Settings, get_settings
from auction_search.database.connection import create_readonly_engine, create_readwrite_engine

log = logging.getLogger(__name__)

_CONCEPT_KEY = re.compile(r"\b[a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)+\b")


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class SearchBody(_Camel):
    query: str = Field(min_length=1, max_length=500)
    mode: Literal["exact", "broad", "exploratory"] | None = None   # None: the admin's default mode
    language: Literal["all", "fr", "en"] = "all"
    limit: int = Field(20, ge=1, le=100)


class ExpandBody(_Camel):
    query: str = Field(min_length=1, max_length=500)
    language: Literal["all", "fr", "en"] = "all"
    search_depth: Literal["exact", "broad", "exploratory"] = Field("broad", alias="searchDepth")
    max_queries: int = Field(20, ge=1, le=100, alias="maxQueries")


class ExternalBody(ExpandBody):
    max_queries: int = Field(40, ge=1, le=100, alias="maxQueries")       # keywords per idea
    max_requests: int = Field(6, ge=1, le=50, alias="maxRequests")       # per provider and language
    providers: list[str] | None = None
    limit: int = Field(20, ge=1, le=100)


class State:
    def __init__(self, settings: Settings, semantic: bool, log_queries: bool = True,
                 jobs: JobRunner | None = None) -> None:
        self.settings = settings
        self.ro = create_readonly_engine(settings)
        self.rw = create_readwrite_engine(settings) if log_queries else None
        self._rw_admin: Engine | None = None
        self.embedder = None
        if semantic:
            from auction_search.embeddings.generator import Embedder

            self.embedder = Embedder(settings.embedding_model, settings.embedding_device)
        # Jobs reload the taxonomy when they finish (a publication or new candidates change it).
        self.jobs = jobs or JobRunner(PROJECT_ROOT, settings.jobs_dir, on_finish=lambda job: self.reload())
        self.reload()

    def rw_engine(self) -> Engine:
        """Read-write engine for review decisions (``auction_search`` only), created on first use."""
        if self._rw_admin is None:
            self._rw_admin = self.rw or create_readwrite_engine(self.settings)
        return self._rw_admin

    def reload(self) -> None:
        from auction_search.external.orchestrator import default_orchestrator
        from auction_search.search.hybrid import HybridSearch
        from auction_search.taxonomy.snapshot import TaxonomySnapshot

        with self.ro.connect() as conn:
            self.snap = TaxonomySnapshot.load(conn, self.settings.app_schema, "auto")
        self.search = HybridSearch(self.ro, self.settings.app_schema, self.snap, self.embedder, log_engine=self.rw)
        self.external = default_orchestrator(self.snap, self.search.expander, self.ro, self.rw, self.settings)


def create_app(settings: Settings | None = None, semantic: bool = True, log_queries: bool = True,
               jobs: JobRunner | None = None) -> FastAPI:
    from auction_search.api.admin import create_admin_router, read_search_settings

    settings = settings or get_settings()
    token = settings.taxonomy_service_token.get_secret_value() if settings.taxonomy_service_token else None
    state: dict[str, State] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
        state["s"] = State(settings, semantic, log_queries, jobs)
        yield
        state.clear()

    app = FastAPI(title="Auction taxonomy search", version="0.1.0", lifespan=lifespan)

    @app.middleware("http")
    async def require_service_token(request: Request, call_next):  # type: ignore[no-untyped-def]
        path = request.url.path
        if path != "/api/health":
            if path.startswith("/api/admin") and not token:
                return JSONResponse({"detail": "the admin API needs TAXONOMY_SERVICE_TOKEN to be set"}, status_code=503)
            if token and not hmac.compare_digest(request.headers.get("x-service-token", ""), token):
                return JSONResponse({"detail": "missing or wrong service token"}, status_code=401)
        return await call_next(request)

    def st() -> State:
        return state["s"]

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        s = st()
        try:
            with s.ro.connect() as conn:
                conn.execute(text("select 1"))
            db = "ok"
        except Exception as exc:  # pragma: no cover - reported, not raised
            db = f"error: {str(exc).splitlines()[0]}"
        return {"database": db, "taxonomyScope": s.snap.scope, "concepts": len(s.snap.concepts),
                "embeddingModel": s.embedder.spec.name if s.embedder else None}

    @app.post("/api/search")
    def search(body: SearchBody) -> dict[str, Any]:
        mode = body.mode or read_search_settings(st())["defaultMode"]
        resp = st().search.search(body.query, mode=mode, limit=body.limit, language=body.language)
        out = resp.as_dict()
        out["taxonomyScope"] = out.pop("taxonomy_scope")
        # English labels of the concepts named in the explanations and the understanding, for display.
        snap = st().snap
        named = {k for hit in resp.direct + resp.related for line in hit.explanation for k in _CONCEPT_KEY.findall(line)}
        named |= {k for g in resp.understanding.get("concepts", []) for k in g.get("concepts", [])}
        out["labels"] = {k: snap.label(k, "en") for k in sorted(named) if k in snap.concepts}
        return out

    @app.post("/api/search/expand")
    def expand(body: ExpandBody) -> dict[str, Any]:
        from auction_search.search.criteria import criteria_for

        expander = st().search.expander
        plan = expander.expand(body.query, language=body.language, depth=body.search_depth,
                               max_queries=body.max_queries)
        criteria = criteria_for(expander, body.query, language=body.language, depth=body.search_depth)
        return {"query": plan.query, "language": plan.language, "searchDepth": plan.depth,
                "taxonomyScope": plan.taxonomy_scope, "concepts": plan.concepts,
                "unresolvedTerms": plan.unresolved_terms, "cached": plan.cached,
                "queries": [{"term": q.term, "language": q.language, "relationship": q.relationship,
                             "priority": q.priority, "concept": q.concept, "combined": q.combined,
                             "group": q.group}
                            for q in plan.queries],
                "criteria": criteria.as_dict()}

    @app.post("/api/search/external")
    def external(body: ExternalBody) -> dict[str, Any]:
        try:
            result = st().external.search(body.query, language=body.language, depth=body.search_depth,
                                          max_queries=body.max_queries, providers=body.providers, limit=body.limit,
                                          max_requests=body.max_requests)
        except KeyError as exc:
            raise HTTPException(status_code=400, detail=f"unknown provider {exc}") from exc
        return result.as_dict()

    @app.post("/api/taxonomy/reload")
    def reload() -> dict[str, Any]:
        st().reload()
        return {"taxonomyScope": st().snap.scope, "concepts": len(st().snap.concepts)}

    app.include_router(create_admin_router(st))
    return app
