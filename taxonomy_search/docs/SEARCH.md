# Search

**Status: implemented (Phases 5–9, 2026-11-08).** Hybrid search, query expansion and the HTTP API
run on the real data. They use the **unreviewed draft taxonomy** until a version is published
(every response says which: `taxonomyScope`), so results are provisional.

## 1. One query, step by step

```
"Find Louis XIV furniture"
  │ understanding.py   noise removed ("find") → concept groups + leftover words + intent
  │                    groups: [Louis XIV → period.louis_xiv | style.louis_xiv] [furniture → furniture]
  ▼
  │ expansion.py       taxonomy terms for each group (FR + EN), by depth and priority
  ▼
  ├─ taxonomy channel  lots with an assertion (not a mere mention) on a group's concepts or their
  │                    descendants; periods match dated_to, styles in_style_of
  ├─ keyword channel   PostgreSQL full-text (french + english tsvectors) on the expanded terms
  │                    and on leftover words
  └─ semantic channel  nearest lots by embedding (pgvector HNSW, cosine)   [broad, exploratory]
  ▼
  merge  reciprocal rank fusion: Σ weight / (60 + rank)
         weights: taxonomy 1.0 · keyword 0.8 · semantic 0.7 · related concepts 0.3
  ▼
  direct matches   every required group (and leftover word) matched by taxonomy or keywords
  related          everything else: partial matches, semantic-only neighbours, related concepts
  each hit carries an explanation: which channel, which concept, which assertion, which term
```

## 2. Query understanding (`search/understanding.py`)

- Taxonomy terms are found in French and English, singular/plural tolerant, longest match first.
- Periods and styles are also found by their **core name** ("Louis XIV" in "Style Louis XIV" and
  "Époque Louis XIV"), so "Louis XIV furniture" resolves to both concepts.
- **Intent words** choose between them: "period", "époque", "d'époque", "made", "genuine" → period
  only; "style", "goût", "manner", "taste", "façon" → style only; otherwise both, and each result says
  which one it matched.
- Search noise ("find", "auctions selling", "trouver", "ventes", articles) is ignored. Remaining
  words are **unresolved terms**: searched as keywords and logged for Phase 10.
- Ambiguous terms ("heels", "pumps", French "or") never form a group on their own.

## 3. Modes

| Mode | Taxonomy channel | Keyword terms | Semantic | Related concepts | Direct-match rule | Related list |
|---|---|---|---|---|---|---|
| `exact` | group concepts + descendants | preferred labels, translations, synonyms, spelling variants, abbreviations | no | no | every group required, including regions and leftover words | none |
| `broad` (default) | as exact | + narrower concepts' labels | yes | no | every concept group required; regions and leftover words only boost ranking (a Louis XV armchair is "French" without saying so; "vintage", "designer" are vague) | partial matches and semantic neighbours |
| `exploratory` | as exact | as broad | yes | yes: lots classified under expansion concepts (style↔period, broader style/period, revivals, associated techniques, eponyms, characteristic objects, regions) | as broad | + related-concept lots |

Measured example (2026-11-08, draft taxonomy, taxonomy + keyword channels, nothing logged),
"Find Louis XIV furniture":

| Mode | Direct | Related | Notes |
|---|---|---|---|
| exact | 4 — lots 6928, 6933, 6934 (`dated_to` Louis XIV period: two commodes, a pier table) and 18024 (`in_style_of` Louis XIV: a mirror) | 0 | each hit says whether it matched the period or the style |
| broad | 5 — the same 4 + lot 19259 | 1,987 | 19259 is a painting whose text contains "Louis XIV" and "furniture": a keyword false positive |
| exploratory | 5 | 3,110 | 1,341 lots reached through related concepts |

Known weakness shown by this example: the related list is ordered by fused score, so lots that
match only "furniture" (Chinese furniture) currently come before Louis XIV objects that are not
furniture. Ranking the related list by which group is matched (the more specific one first) is an
open improvement.

## 4. Query expansion (`search/expansion.py`, Phase 7)

| Depth | Adds | Priority |
|---|---|---|
| exact | preferred labels in each language, translations, synonyms | 1 |
| | spelling variants | 2 |
| broad | narrower concepts (ankle boots for boots, transitively) | 2 |
| | broader style/period; the period of a style and the style of a period | 2 |
| | associated techniques (Boulle marquetry) | 3 |
| exploratory | every other typed association (revivals, materials, makers, characteristic objects) | 3–4 |

Several groups are **combined** into phrases using each language's word order ("Mobilier Louis
XIV", "Louis XIV furniture"). Results are de-duplicated (case- and accent-insensitive), limited
(`maxQueries`), and cached per (query, language, depth, limit, taxonomy fingerprint).

Sub-types are listed nearest first (furniture → beds, case furniture, desks, mirrors, screens,
seating, tables; then armoires, commodes, armchairs, chairs, consoles …), up to `MAX_NARROWER = 40`
per concept. Until 2026-11-08 only the first 12 *in alphabetical order* were kept, which silently
dropped seating and tables from "Louis XIV furniture". A word that is the same in both languages
("Commodes", "Tables") is kept once and marked valid for both (`und`).

The internal keyword channel uses only the first `KEYWORD_TERMS = 10` keywords per idea and
language (labels, then the nearest sub-types): the taxonomy channel already finds classified lots
of every sub-type, and ranking thousands of lots against 50+ words cost ≈ 120 ms per idea.
Measured on the benchmark (2026-11-08): no limit — P@10 0.795, nDCG@10 0.881, mean 66 ms, p95
230 ms; limit 10 — P@10 0.800, nDCG@10 0.883, mean 33 ms, p95 63 ms.

**Search criteria for other engines and APIs** (`search/criteria.py`): the same plan regrouped by
idea — every keyword of each idea, an AND/OR query per language and combined phrases ("Commodes
Louis XIV") for search boxes without AND/OR; see EXTERNAL_APIS.md. Command:
`expand-query "Louis XIV furniture" --criteria`; API: the `criteria` field of
`POST /api/search/expand`.

Example, from the live API:

```json
{"query": "Louis XIV furniture", "searchDepth": "broad", "taxonomyScope": "draft",
 "concepts": ["furniture", "period.louis_xiv", "style.louis_xiv"], "unresolvedTerms": [],
 "queries": [
   {"term": "Mobilier Louis XIV", "language": "fr", "relationship": "translation", "priority": 1, "combined": true},
   {"term": "Meubles Louis XIV",  "language": "fr", "relationship": "synonym",     "priority": 1, "combined": true},
   {"term": "Louis XIV furniture", "language": "en", "relationship": "preferred",  "priority": 1, "combined": true},
   {"term": "Louis Quatorze furniture", "language": "en", "relationship": "synonym", "priority": 1, "combined": true},
   …]}
```

## 5. Indexes (`search/index.py`, `embeddings/generator.py`)

- `auction_search.lot_search_documents`: per lot, French and English title (weight A) and the first
  600 characters of the description (weight B) as `tsvector`s (`french` / `english`
  configurations, GIN indexes), accents folded in Python (`unaccent` is not installed), HTML
  unescaped, the description's repeated title removed, and a field whose text is in another
  language (e.g. German in `description_en`) left out of that language's vector; plus Drouot category, auction date and lot URL
  for display. Built by `build-search-index`, incremental by content hash.
- `auction_search.lot_embeddings`: one 384-dimension vector per lot from
  `paraphrase-multilingual-MiniLM-L12-v2` (French title + 400 characters, English title + lead,
  approved assertion labels), HNSW cosine index. Built by `build-embeddings`, incremental by text hash.

**Why this model** (`reports/embedding_benchmark.md`, measured locally, 0 tokens): on English
queries over **French-only** text it found the right Drouot category in the top 10 more often
(P@10 0.569 vs 0.375 for `multilingual-e5-small`); e5 was better at matching a lot's English title
to its own French text (MRR 0.892 vs 0.746). Search needs the first. Both models take ≈ 470 MB on
disk and run on the Mac's GPU (MPS); 20,923 lots embed in 99 s. **Semantic search alone is not
adequate here**: it confuses "Louis XIV period" with "Napoleon III, Louis XVI style" (both are
gilt-bronze furniture text) — which is why it only feeds related suggestions and ranking.

## 6. Interfaces

CLI: `search`, `expand-query`, `compare-search`, `serve-api` (PROGRAMS.md §1.20–1.23).

HTTP (`serve-api`, FastAPI; started with `--no-semantic` it skips loading the model):

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/health` | — | database status, taxonomy scope, number of concepts, embedding model |
| `POST /api/search` | `query`, `mode` (exact/broad/exploratory), `language` (all/fr/en), `limit` (1–100) | `direct[]`, `related[]` (lot id, title, excerpt, auction date, URL, score, explanation), totals, channel counts, understanding, `taxonomyScope`, `took_ms` |
| `POST /api/search/expand` | `query`, `language`, `searchDepth`, `maxQueries` | the expansion plan shown above |
| `POST /api/search/external` | as expand + `providers`, `limit` | EXTERNAL_APIS.md |
| `POST /api/taxonomy/reload` | — | reloads the taxonomy after a review or publication |

Invalid values → 422; unknown provider → 400. Each search is logged in
`auction_search.search_queries` (query, mode, concepts, unresolved terms, counts, time) — the input
of Phase 10. Logging can be turned off (`create_app(log_queries=False)`, used by the tests).

## 7. Measured results

Search comparison on the brief's examples (`reports/search_comparison.md`, broad mode, draft
taxonomy) — number of lots found:

| Query | Keyword (whole sentence) | Keyword (content words) | Hybrid direct | Time |
|---|---|---|---|---|
| Find auctions selling shoes | 0 | 19 | 42 | 148 ms (first query, cold) |
| Find Louis XIV furniture | 0 | 0 | 5 | 79 ms |
| Find French eighteenth-century armchairs | 0 | 0 | 23 | 65 ms |
| Find antique furniture with Boulle marquetry | 0 | 0 | 8 | 63 ms |
| Find vintage designer handbags | 0 | 3 | 218 | 25 ms |
| Find French Baroque cabinets | 0 | 1 | 1 | 14 ms |

Counts are not relevance. Relevance was measured in Phase 9 on 20 queries with provisional labels
(TESTING.md, "Search evaluation"): hybrid broad P@10 0.795, R@50 0.828, nDCG@10 0.880, MRR 0.967 in
34 ms on average, against 0.525 / 0.432 / 0.582 / 0.710 in 1 ms for keyword search on content
words. Weak spots found: "French Baroque cabinets" (P@10 0.2 — few lots, and "baroque" is rarely
written), "pièces de monnaie en or" (0.7 — gold jewellery competes), "vintage designer handbags"
in broad mode (0.5 — semantic neighbours outrank tagged handbags).

## 8. Tuning

Constants in `search/hybrid.py`: `RRF_K = 60`, `WEIGHTS`, `SEMANTIC_LIMIT = 200`,
`KEYWORD_LIMIT = 3000`, `KEYWORD_TERMS = 10`, `SOFT_DIMENSIONS`. Change one, then run `run-regression`: it fails if
P@10, R@50 or nDCG@10 drop by more than 0.05 against `data/benchmark/baseline_metrics.json`.

## Facts from Phase 3 that shape the design

| Finding | Consequence |
|---|---|
| Ambiguous terms attest the wrong objects: "heels" in 43 *Arms* lots, "pumps" in car/bicycle lots, French "bottes" for sheaves | Query expansion must not expand to ambiguous terms alone; classification must not use them alone. |
| A mention in a long catalogue note is not a property of the lot (lot 6928 mentions "stamp" and A.-C. Boulle as context) | Rank title and first sentence above notes; use lot assertions (Phase 4), not raw mentions, for filters. |
| Louis XV/XVI *style* lots outnumber *period* lots 2.5–6× | "Louis XV furniture" needs both a strict mode (period) and a broad mode (period + style), as planned. |
| French→English alignment over the bilingual lots finds real translations ("Bouteille à tabac" → "Snuff bottle", "Restauration" → "Restoration") | Usable to propose translations for query expansion; still reviewed before publication. |

## Facts from Phase 1 that shape the design

| Finding | Consequence |
|---|---|
| ~90% of descriptions start with the full title | Build searchable text from the description (adding the title only when it is not already a prefix) to avoid double-weighting. |
| ~1% of titles/descriptions contain HTML entities (`&amp;`) | Unescape before indexing and embedding. |
| 7.2% of titles are identical in FR and EN; many titles are just an artist or brand name ("LOUIS VUITTON" ×43) | Titles alone are often uninformative; descriptions carry the content. |
| `description_en` is German in ~3.4% of lots; `description_fr` contains English in ~2% | Do not choose a full-text configuration purely by column name; a multilingual embedding model helps here. |
| `french` and `english` text-search configurations exist; `unaccent` is available but not installed | FTS is possible without new extensions; accent-insensitive matching would need `unaccent` (trusted, installable with CREATE privilege) or Python-side normalisation. |
| pgvector 0.8.7 is installed (schema `public`) | Vector storage and HNSW/IVFFlat indexes are available. |
| Auction descriptions are boilerplate; 26 auctions lack title/date/house | Auction fields add little to relevance; return auction date/URL where present. |
| Sub-lots share a lot number and are prefixed "1 - ", "2 - " in the title | Display/ranking should treat them as separate lots; the lot PK `id` is the identifier. |
