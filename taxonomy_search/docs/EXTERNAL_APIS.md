# External auction APIs

**Status: framework implemented (Phase 8, 2026-11-08); no real external provider is connected.**

No auction provider's API documentation, terms of use or credentials were available to this
project, so none is integrated. The framework is complete and tested with two providers that are
safe to call:

| Provider | Name | What it is |
|---|---|---|
| `MockProvider` (`external/mock_provider.py`) | `mock` | 26 **fictitious** lots in `data/external/mock_catalogue.json` (shoes, furniture, and Louis XIV objects that are not furniture); 3 results per page, supports AND and OR, can be told to fail the first N calls. For tests and demonstrations. |
| `LocalDatabaseProvider` (`external/local_provider.py`) | `local_drouot` | Full-text search over this project's own `auction_search.lot_search_documents` (the Drouot lots already in PostgreSQL), behind the same interface — proves the pipeline on real text. Supports AND and OR (built as a PostgreSQL tsquery); 4 pages of 25 per request. |

## Rules (unchanged from the brief)

- No provider is assumed to have a public API.
- No scraping or undocumented endpoints without first establishing access terms and permitted use.
- A real provider is integrated only when its API documentation and credentials are available.
- **External results never modify the taxonomy.** The external package has no taxonomy write path,
  and `run-regression` checks that an external search leaves the taxonomy tables unchanged
  (concepts, terms, relationships counted before and after: 1,128 / 2,260 / 500 → identical).

The source data itself comes from Drouot through an existing collector outside this project; this
project only reads what that collector stored in PostgreSQL.

## Search criteria: what is sent (`search/criteria.py`)

The taxonomy turns the query into **ideas**, each with every keyword a catalogue may use for it, in
French and English. A lot is relevant when it contains one keyword of **every required idea**. Only
the taxonomy is used — no lot data. For "Louis XIV furniture" (broad):

```
Idea 1 'Louis XIV' (required)   Louis XIV, Louis Quatorze
Idea 2 'furniture' (required)   fr: Mobilier, Meubles, Lits, Bureaux, Miroirs, Paravents, Sièges, Tables,
                                    Armoires, Cabinets, Coffres, Commodes, Buffets, Fauteuils, Chaises,
                                    Canapés, Sofas, Tabourets, Consoles, Bergères, Banquettes
                                en: Furniture, Beds, Desks, Mirrors, …, Commodes, Armchairs, Chairs, … (27)

AND/OR query (fr):  ("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR "Meubles" OR "Lits" OR …)
Phrases (fr):       Mobilier Louis XIV, Meubles Louis XIV, …, Commodes Louis XIV, Fauteuils Louis XIV, …
```

- **Which keywords** an idea gets depends on the depth, as in the internal search: `exact` — same
  meaning (labels, translations, synonyms, variants); `broad` — + sub-types; `exploratory` — +
  related ideas (French Baroque, Boulle marquetry). Up to 40 keywords per idea and language
  (`--max-queries`).
- **Core names:** "Louis XIV" covers "Époque Louis XIV" and "Style Louis XIV" when the query says
  neither "époque" nor "style"; a keyword that contains a shorter keyword of the same idea is not
  repeated ("Bureaux plats" is covered by "Bureaux"). Anything matching the longer phrase matches the
  shorter one, so requests get shorter without losing results.
- **Optional ideas:** a region ("French") and leftover vague words ("vintage") are not required:
  they only rank results, as in the internal search.
- **A word that is the same in both languages** ("Commodes", "Tables", "Bergères") is used for both.

See the criteria for any query (and copy them into any API by hand):

```bash
.venv/bin/python -m auction_search.cli expand-query "Louis XIV furniture" --criteria
```

They are also in the `criteria` field of `POST /api/search/expand` (JSON: ideas, keywords per
language, `boolean` per language, `phrases`).

## Requests per provider (`external/base.py`)

`AuctionProvider.build_requests(criteria, language, max_requests)` turns the criteria into requests
according to the provider's `ProviderCapabilities`:

| API supports | Requests sent |
|---|---|
| AND and OR (`supports_and`, `supports_or`) | `("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR …)`; when longer than `max_query_length`, the longest OR-list is split in halves — every request keeps every required idea, every keyword is sent once |
| OR only | `"Mobilier Louis XIV" OR "Meubles Louis XIV" OR …` (combined phrases), as many per request as fit |
| neither | one combined phrase per request ("Commodes Louis XIV") |

At most `max_requests` per provider and language (default 6), most important keywords first.
The request text uses the canonical syntax (`render_boolean`; `parse_boolean` reads it back as an
AND of OR-lists); an adapter whose API has another syntax converts it in `fetch_page`.

A provider subclasses `AuctionProvider` and defines:

| Member | Purpose |
|---|---|
| `name` | Identifier used in requests, results and logs. |
| `capabilities: ProviderCapabilities` | `languages`, `supports_or`, `supports_and`, `max_query_length`, `page_size`, `max_pages`, `requests_per_second`, `timeout_seconds`, `max_retries`. |
| `fetch_page(query, language, page) -> ProviderPage` | **Required.** One page of results as `ExternalLot`s plus `next_page`. Raise `TransientProviderError` for retryable failures (timeouts, 429, 5xx) and `ProviderError` for permanent ones. |
| `build_requests(criteria, language, max_requests)` | Optional override; the default follows the table above. |

Supplied by the base class: `search()` walks the pages up to `max_pages`; a `RateLimiter` spaces
requests to `requests_per_second`; `with_retries` retries transient errors with exponential
back-off (0.5 s, 1 s, 2 s …, up to `max_retries`); request and error counters (`describe()`).
Fewer, broader requests make `max_pages` matter: the local provider uses 4 pages of 25 (with 1
page, "shoes" lost 3 lots because both of its requests were cut at 25 results).

`ExternalLot` is the normalised result: provider, external id, title, description, URL, language,
auction title/date/house, estimate low/high, currency — plus fields the orchestrator fills:
`found_by` (keywords of the request that the lot contains), `validation` (concepts confirmed in its
text), `coverage`, `score`, `duplicates`.

Authentication: a real adapter reads its credentials from environment variables (e.g.
`PROVIDER_X_API_KEY`), never from code or documentation; the two current providers need none.

## Orchestration (`external/orchestrator.py`)

1. Build the search criteria from the query (`criteria_for`, above).
2. For each provider and language, build its requests (`build_requests`).
3. Execute. A failing request is recorded and the others continue; a failing provider does not
   stop the others. Every request sent is listed in the result (`requests`: provider, language,
   query, results, error).
4. De-duplicate: same provider id, then the same normalised title + auction date across providers
   (the duplicate's id is kept in `duplicates`).
5. Validate each lot against the query's ideas using the taxonomy on the lot's own text: **direct**
   when every required idea is confirmed, otherwise **related**.
6. Log per provider and keyword — results, direct matches, error — in
   `auction_search.external_search_log`.

## Interfaces

```bash
.venv/bin/python -m auction_search.cli search-external "Louis XIV furniture" --providers mock,local_drouot
```

Options: `--depth`, `--language`, `--max-queries N` (keywords per idea, 40), `--max-requests N`
(per provider and language, 6), `--limit N`, `--json`. The output starts with the requests sent.
`POST /api/search/external` takes `query`, `language`, `searchDepth`, `maxQueries`, `maxRequests`,
`providers`, `limit`; an unknown provider gives HTTP 400; the response includes `criteria` and
`requests`.

## Before and after (2026-11-08)

Until 2026-11-08 an API received the first 12 keywords of a flat list, all joined with OR — for
"Louis XIV furniture": `"Mobilier Louis XIV" OR "Époque Louis XIV" OR "Style Louis XIV" …`, **no
furniture word at all**, so it was asked for every Louis XIV object. Measured with both providers
(mock catalogue with 8 extra fictitious Louis XIV lots, 6 of them not furniture; draft taxonomy;
nothing logged):

| Query | Before: requests / lots fetched / direct / not matching | After |
|---|---|---|
| Louis XIV furniture | 18 / 23 / 9 / 14 — all 6 non-furniture test lots fetched | 16 / 11 / 9 / 2 — none of them fetched |
| shoes | 14 / 40 / 37 / 3 — mock "Bottines" (M001) and sneakers (M018) missed | 8 / 45 / 42 / 3 — all 7 mock shoes |
| commode Louis XV | 15 / 106 / 4 / 102 | 4 / 14 / 7 / 7 |
| Chinese porcelain vase | 15 / 87 / 6 / 81 | 10 / 108 / 108 / 0 |

"Before" misses in "shoes" came from the 12-keyword cut ("Bottines", a sub-type of boots, fell
outside it). The local provider fetched 1 page (25 lots) per request before and 4 pages after; the
vase query's 108 direct lots come largely from those extra pages, the drop in non-matching lots from
the AND requests.

## Adding a real provider

1. Obtain the provider's API documentation, terms of use and credentials; record them (not the
   secrets) in this file: endpoint, authentication, search syntax (does it support AND / OR /
   phrases?), languages, pagination, rate limits. Set `supports_and` / `supports_or` accordingly.
2. Write `external/<provider>.py` subclassing `AuctionProvider`; in `fetch_page` convert the
   canonical request (`parse_boolean`) to the API's syntax; map its fields to `ExternalLot`;
   raise `TransientProviderError` on timeouts / 429 / 5xx.
3. Add tests with recorded responses (no live calls in the test suite).
4. Register it in `default_orchestrator` behind an environment variable that enables it.
