"""Hybrid search, classification results and the HTTP API against the real database (read-only).

Queries are not logged (log_engine=None / log_queries=False), so the tests write nothing.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import Engine, text

from auction_search.config import Settings
from auction_search.search.hybrid import HybridSearch
from auction_search.taxonomy.snapshot import TaxonomySnapshot

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def ready(live_engine: Engine, settings: Settings) -> None:
    with live_engine.connect() as conn:
        n = conn.execute(text("select to_regclass(:t) is not null and (select count(*) > 0 from "
                              f'"{settings.app_schema}".lot_classification_state)'),
                         {"t": f"{settings.app_schema}.lot_search_documents"}).scalar()
    if not n:
        pytest.skip("run classify-lots and build-search-index first")


@pytest.fixture(scope="module")
def engine(live_engine: Engine, settings: Settings, ready: None) -> HybridSearch:
    with live_engine.connect() as conn:
        snap = TaxonomySnapshot.load(conn, settings.app_schema)
    return HybridSearch(live_engine, settings.app_schema, snap, embedder=None, log_engine=None)


def test_louis_xiv_period_versus_style(engine: HybridSearch) -> None:
    period = engine.search("commode d'époque Louis XIV", mode="exact", log_query=False)
    ids = [h.lot_id for h in period.direct]
    assert {6928, 6933} <= set(ids)
    assert all(any("taxonomy" in w for w in h.explanation) for h in period.direct)
    style = engine.search("Louis XIV style", mode="exact", log_query=False, limit=50)
    style_ids = {h.lot_id for h in style.direct}
    assert 7059 in style_ids and 6928 not in style_ids  # 19th-century piece in the style, not the period one


def test_shoes_and_baseline(engine: HybridSearch) -> None:
    resp = engine.search("Find auctions selling shoes", mode="broad", log_query=False, limit=50)
    assert resp.total_direct >= 20
    assert resp.understanding["concepts"][0]["concepts"] == ["fashion.footwear"]
    assert engine.keyword_baseline("Find auctions selling shoes") == []
    assert engine.content_words("Find auctions selling shoes") == "shoes"
    assert len(engine.keyword_baseline("shoes", 200)) > 0


def test_exact_mode_has_no_related_suggestions(engine: HybridSearch) -> None:
    resp = engine.search("French Baroque cabinets", mode="exact", log_query=False)
    assert resp.related == [] and resp.channel_counts["semantic"] == 0


def test_classification_state_is_complete(live_engine: Engine, settings: Settings, ready: None) -> None:
    with live_engine.connect() as conn:
        lots = conn.execute(text(f'select count(*) from "{settings.db_schema}".lots')).scalar()
        state = conn.execute(text(f'select count(*) from "{settings.app_schema}".lot_classification_state')).scalar()
        bad = conn.execute(text(
            f'select count(*) from "{settings.app_schema}".lot_concepts lc join "{settings.app_schema}".taxonomy_concepts c '
            f"on c.id = lc.concept_id where (lc.assertion = 'dated_to' and c.dimension <> 'period') "
            f"or (lc.assertion = 'in_style_of' and c.dimension <> 'style')")).scalar()
    assert state == lots and bad == 0


@pytest.fixture(scope="module")
def client(settings: Settings, ready: None) -> Iterator[Any]:
    testclient = pytest.importorskip("fastapi.testclient")  # optional extra "api"
    from auction_search.api.main import create_app

    open_settings = settings.model_copy(update={"taxonomy_service_token": None})  # this test checks the public API
    with testclient.TestClient(create_app(open_settings, semantic=False, log_queries=False)) as c:
        yield c


def test_api_health_expand_search_external(client: Any) -> None:
    health = client.get("/api/health").json()
    assert health["database"] == "ok" and health["taxonomyScope"] in ("draft", "published")
    expand = client.post("/api/search/expand", json={"query": "Louis XIV furniture", "language": "all",
                                                     "searchDepth": "broad", "maxQueries": 25}).json()
    assert {"furniture", "period.louis_xiv", "style.louis_xiv"} <= set(expand["concepts"])
    terms = {q["term"] for q in expand["queries"]}
    assert "Mobilier Louis XIV" in terms and "Louis Quatorze furniture" in terms
    assert expand["criteria"]["boolean"]["fr"].startswith('("Louis XIV" OR "Louis Quatorze") AND')
    assert "Commodes" in {t["term"] for t in expand["criteria"]["groups"][1]["terms"]["fr"]}
    search = client.post("/api/search", json={"query": "commode Louis XIV", "mode": "exact"}).json()
    assert search["taxonomyScope"] in ("draft", "published") and search["direct"]
    ext = client.post("/api/search/external", json={"query": "Louis XIV furniture", "providers": ["mock"]}).json()
    assert {lot["external_id"] for lot in ext["direct"]} >= {"M006", "M007"}
    assert ext["requests"] and all(" AND " in r["query"] for r in ext["requests"])
    assert client.post("/api/search", json={"query": "x", "mode": "fuzzy"}).status_code == 422
    assert client.post("/api/search/external", json={"query": "x", "providers": ["nope"]}).status_code == 400
