"""Provider adapter interface, normalised result model, rate limiting and retries.

A provider adapter handles, for one platform: authentication, its query syntax, pagination, rate
limits, retries and timeouts, normalisation of results into ``ExternalLot`` and source attribution.
Everything else (expansion, deduplication, validation, ranking, logging) is shared and lives in the
orchestrator.

Requests are built from ``SearchCriteria`` (``search/criteria.py``) according to what the API can do:

* AND + OR — ``("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR "Commodes" OR …)``, split into
  several requests when too long (each keeps every required idea);
* OR only — ``"Commodes Louis XIV" OR "Fauteuils Louis XIV" OR …`` (combined phrases);
* neither — one combined phrase per request.

The request text is in the canonical syntax (``render_boolean``); an adapter whose API uses another
syntax converts it in ``fetch_page`` (``parse_boolean`` gives the AND of OR-lists).
"""

from __future__ import annotations

import abc
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, TypeVar

from auction_search.search.criteria import render_boolean, split_cnf

if TYPE_CHECKING:
    from auction_search.search.criteria import SearchCriteria

log = logging.getLogger(__name__)

T = TypeVar("T")


class ProviderError(Exception):
    """Permanent failure (bad credentials, invalid query): do not retry."""


class TransientProviderError(ProviderError):
    """Temporary failure (timeout, HTTP 429/5xx): retried with exponential backoff."""


@dataclass(frozen=True)
class ProviderCapabilities:
    languages: tuple[str, ...] = ("fr", "en")
    supports_or: bool = False            # can one request carry "A OR B"?
    supports_and: bool = False           # can it carry "(A OR B) AND (C OR D)"? (requires supports_or)
    max_query_length: int = 200
    page_size: int = 20
    max_pages: int = 3
    requests_per_second: float = 2.0
    timeout_seconds: float = 10.0
    max_retries: int = 3


@dataclass
class ExternalLot:
    """A lot from any provider, normalised. ``provider`` + ``external_id`` attribute the source."""

    provider: str
    external_id: str
    title: str
    description: str = ""
    url: str | None = None
    language: str | None = None
    auction_title: str | None = None
    auction_date: str | None = None
    auction_house: str | None = None
    estimate_low: float | None = None
    estimate_high: float | None = None
    currency: str | None = None
    found_by: list[str] = field(default_factory=list)        # expansion phrases that returned it
    validation: list[str] = field(default_factory=list)      # concepts confirmed in its text
    coverage: float = 0.0
    score: float = 0.0
    duplicates: list[str] = field(default_factory=list)       # other provider:id judged identical


@dataclass
class ProviderRequest:
    """One request to a provider: its text, and the keywords it carries (for attribution and logging)."""

    query: str
    language: str
    terms: list[str]


@dataclass
class ProviderPage:
    items: list[ExternalLot]
    next_page: int | None = None


class RateLimiter:
    """Minimum interval between requests (token bucket of size 1)."""

    def __init__(self, per_second: float, clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.interval = 1.0 / per_second if per_second > 0 else 0.0
        self.clock, self.sleep = clock, sleep
        self._next = 0.0

    def wait(self) -> None:
        now = self.clock()
        if now < self._next:
            self.sleep(self._next - now)
            now = self._next
        self._next = now + self.interval


def with_retries(fn: Callable[[], T], max_retries: int, sleep: Callable[[float], None] = time.sleep,
                 base_delay: float = 0.5) -> T:
    """Call ``fn``; on ``TransientProviderError`` retry with exponential backoff (0.5 s, 1 s, 2 s…)."""
    attempt = 0
    while True:
        try:
            return fn()
        except TransientProviderError:
            if attempt >= max_retries:
                raise
            delay = base_delay * (2 ** attempt)
            log.info("transient provider error, retrying", extra={"attempt": attempt + 1, "delay": delay})
            sleep(delay)
            attempt += 1


class AuctionProvider(abc.ABC):
    """Implement ``name``, ``capabilities`` and ``fetch_page``; optionally ``build_requests``."""

    name: str = "provider"
    capabilities: ProviderCapabilities = ProviderCapabilities()

    def __init__(self, sleep: Callable[[float], None] = time.sleep) -> None:
        self._sleep = sleep
        self._limiter = RateLimiter(self.capabilities.requests_per_second, sleep=sleep)
        self.requests = 0
        self.errors = 0

    def build_requests(self, criteria: SearchCriteria, language: str, max_requests: int = 6) -> list[ProviderRequest]:
        """The requests that carry ``criteria`` in ``language`` with this provider's capabilities.

        Most important keywords first; at most ``max_requests``; nothing longer than ``max_query_length``.
        """
        cap = self.capabilities
        if cap.supports_and and cap.supports_or:
            parts = split_cnf(criteria.cnf(language), cap.max_query_length)
            requests = [ProviderRequest(render_boolean(c), language, [t for alts in c for t in alts]) for c in parts]
            return requests[:max_requests]
        phrases = [t.term for t in criteria.phrases.get(language, [])
                   if len(render_boolean([[t.term]])) <= cap.max_query_length]
        if cap.supports_or:
            chunks: list[list[str]] = []
            for phrase in phrases:
                if chunks and len(render_boolean([chunks[-1] + [phrase]])) <= cap.max_query_length:
                    chunks[-1].append(phrase)
                else:
                    chunks.append([phrase])
            return [ProviderRequest(render_boolean([c]), language, c) for c in chunks][:max_requests]
        return [ProviderRequest(p, language, [p]) for p in phrases[:max_requests]]

    @abc.abstractmethod
    def fetch_page(self, query: str, language: str | None, page: int) -> ProviderPage:
        """One page of results. Raise TransientProviderError for retryable failures."""

    def search(self, query: str, language: str | None = None) -> list[ExternalLot]:
        """All pages (up to ``max_pages``), with rate limiting and retries."""
        items: list[ExternalLot] = []
        page: int | None = 1
        while page is not None and page <= self.capabilities.max_pages:
            def call(p: int = page) -> ProviderPage:
                self._limiter.wait()
                self.requests += 1
                return self.fetch_page(query, language, p)

            try:
                result = with_retries(call, self.capabilities.max_retries, sleep=self._sleep)
            except ProviderError:
                self.errors += 1
                raise
            items += result.items
            page = result.next_page
        return items

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "requests": self.requests, "errors": self.errors}
