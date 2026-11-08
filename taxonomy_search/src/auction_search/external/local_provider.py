"""The project's own Drouot lots exposed through the provider interface.

Useful as a realistic second provider: it shows that an adapter needs only a query translation and a
normalisation step, and it lets the orchestrator's deduplication and validation be exercised on real
catalogue text. It reads ``auction_search.lot_search_documents`` (read-only) with full-text search.

The canonical request ``("a" OR "b") AND ("c")`` becomes the tsquery
``(phraseto_tsquery(cfg, a) || phraseto_tsquery(cfg, b)) && phraseto_tsquery(cfg, c)``; every phrase is
a bound parameter.
"""

from __future__ import annotations

from sqlalchemy import Engine, text

from auction_search.external.base import AuctionProvider, ExternalLot, ProviderCapabilities, ProviderPage
from auction_search.search.criteria import parse_boolean
from auction_search.search.index import fold


class LocalDatabaseProvider(AuctionProvider):
    name = "local_drouot"
    capabilities = ProviderCapabilities(languages=("fr", "en"), supports_or=True, supports_and=True,
                                        max_query_length=200,
                                        page_size=25, max_pages=4, requests_per_second=50.0)

    def __init__(self, engine: Engine, schema: str) -> None:
        super().__init__()
        self.engine, self.schema = engine, schema

    def fetch_page(self, query: str, language: str | None, page: int) -> ProviderPage:
        config = {"fr": "french", "en": "english"}
        langs = [language] if language in config else ["fr", "en"]
        params: dict[str, object] = {}
        groups = []
        for alternatives in parse_boolean(query):
            names = []
            for phrase in alternatives:
                if fold(phrase).strip():
                    names.append(f"p{len(params)}")
                    params[names[-1]] = fold(phrase)
            if names:
                groups.append(names)
        if not groups:
            return ProviderPage([], None)

        def tsquery(cfg: str) -> str:
            return " && ".join("(" + " || ".join(f"phraseto_tsquery('{cfg}', :{n})" for n in g) + ")" for g in groups)

        where = " or ".join(f"tsv_{lang} @@ ({tsquery(config[lang])})" for lang in langs)
        size = self.capabilities.page_size
        with self.engine.connect() as conn:
            rows = conn.execute(text(
                f'select lot_id, source_lot_id, title_fr, title_en, lead_fr, lead_en, lot_url, auction_key, auction_date '
                f'from "{self.schema}".lot_search_documents where {where} order by lot_id limit :n offset :o'),
                params | {"n": size + 1, "o": (page - 1) * size}).all()
        items = [ExternalLot(
            provider=self.name, external_id=str(r.source_lot_id), title=(r.title_en if language == "en" else r.title_fr)
            or r.title_fr or r.title_en or "", description=(r.lead_en if language == "en" else r.lead_fr) or "",
            url=r.lot_url, language=language if language in config else "fr", auction_title=r.auction_key,
            auction_date=r.auction_date.date().isoformat() if r.auction_date else None, auction_house=None)
            for r in rows[:size]]
        return ProviderPage(items, page + 1 if len(rows) > size else None)
