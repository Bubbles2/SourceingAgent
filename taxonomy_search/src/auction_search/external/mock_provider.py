"""Mock provider for automated tests: a fixed fictitious catalogue (data/external/mock_catalogue.json).

Behaves like a simple keyword API with AND/OR: a phrase matches a lot when all its words (accent- and
case-insensitive, singular/plural tolerant) occur in its title or description; ``("A" OR "B") AND
("C" OR "D")`` matches when one phrase of every OR-list does (plain phrases and OR lists also work). Pages of ``page_size`` items. ``fail_first`` makes the first N requests raise a
transient error so retries can be tested.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from auction_search.enrichment.text import lemma
from auction_search.external.base import (
    AuctionProvider,
    ExternalLot,
    ProviderCapabilities,
    ProviderPage,
    TransientProviderError,
)
from auction_search.search.criteria import parse_boolean
from auction_search.taxonomy.normalization import normalize_term

CATALOGUE = Path(__file__).resolve().parents[3] / "data" / "external" / "mock_catalogue.json"


class MockProvider(AuctionProvider):
    name = "mock"
    capabilities = ProviderCapabilities(languages=("fr", "en"), supports_or=True, supports_and=True,
                                        max_query_length=120,
                                        page_size=3, max_pages=3, requests_per_second=1000.0, max_retries=2)

    def __init__(self, catalogue: Path = CATALOGUE, fail_first: int = 0,
                 sleep: Callable[[float], None] = lambda s: None) -> None:
        super().__init__(sleep=sleep)
        data = json.loads(catalogue.read_text(encoding="utf-8"))
        self.lots: list[dict[str, Any]] = data["lots"]
        self.fail_first = fail_first
        self.queries: list[str] = []

    @staticmethod
    def _words(value: str) -> set[str]:
        return set(lemma(normalize_term(value)).split())

    def _matches(self, lot: dict[str, Any], query: str) -> bool:
        haystack = self._words(f"{lot['title']} {lot['description']}")
        cnf = parse_boolean(query)
        return bool(cnf) and all(any(self._words(alt) and self._words(alt) <= haystack for alt in alternatives)
                                 for alternatives in cnf)

    def fetch_page(self, query: str, language: str | None, page: int) -> ProviderPage:
        self.queries.append(query)
        if self.fail_first > 0:
            self.fail_first -= 1
            raise TransientProviderError("simulated timeout")
        hits = [lot for lot in self.lots if self._matches(lot, query)
                and (language in (None, "all") or lot["language"] == language)]
        size = self.capabilities.page_size
        chunk = hits[(page - 1) * size: page * size]
        items = [ExternalLot(
            provider=self.name, external_id=lot["id"], title=lot["title"], description=lot["description"],
            url=f"https://example.invalid/lots/{lot['id']}", language=lot["language"], auction_title=lot["auction"],
            auction_date=lot["date"], auction_house=lot["house"], estimate_low=lot["estimate"][0],
            estimate_high=lot["estimate"][1], currency=lot["currency"]) for lot in chunk]
        return ProviderPage(items, page + 1 if page * size < len(hits) else None)
