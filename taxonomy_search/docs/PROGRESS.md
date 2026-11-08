# Progress

## Phases

| Phase | Title | Status |
|---|---|---|
| 1 | Inspect the existing PostgreSQL database | **Complete (2026-11-07)** — approved |
| 2 | Design the specialist taxonomy | **Complete (2026-11-07)** — migration `0001` applied; seed loaded as draft/candidate |
| 3 | Build the taxonomy from existing lot data | **Complete (2026-11-07)** — 952 candidates imported as draft `0.2.0`; awaiting human review |
| 4 | Classify existing lots | **Complete (2026-11-07)** — 20,923 lots classified with the draft taxonomy |
| 5 | Generate semantic embeddings | **Complete (2026-11-07)** — 20,923 lots embedded (local model) |
| 6 | Internal hybrid search engine | **Complete (2026-11-08)** — hybrid search, CLI and HTTP API |
| 7 | Query expansion engine | **Complete (2026-11-08)** |
| 8 | External auction API search | **Complete (2026-11-08)** — framework + mock/local providers; no real provider |
| 9 | Search evaluation and optimisation | **Complete (2026-11-08)** — provisional labels; human labels pending |
| 10 | Continuous taxonomy improvement | **Complete (2026-11-08)** — 24 proposals in draft `0.3.0`; regression PASS |

## Phase 1 — summary

Delivered: Python project (`pyproject.toml`, `.venv`, `.env.example`, `.gitignore`), read-only
inspection programs `check-db`, `inspect-db`, `analyze-lots`, reports in `reports/`, 60 tests,
and all documentation files. **No database changes were made.**

### Key findings

1. **Tables.** Auctions are in `drouot_collector.auctions` (122 rows) and lots in
   `drouot_collector.lots` (20,923 rows). Lots reference auctions via `(source, auction_id)`
   (text business key). Primary keys are `id` bigint identity on both. Three other tables are
   collector bookkeeping.
2. **Bilingual data.** FR and EN title and description exist for 20,920 of 20,923 lots; 3 lots
   failed collection and are empty. 15 lots have no category.
3. **Field language is not guaranteed.** By content: `description_fr` is French in 89.6%,
   English in 2.0% (bilingual catalogue text); `description_en` is English in 86.1%, **German in
   3.4%**, Dutch 0.6% (untranslated originals). The rest is too short to tell.
4. **Categories.** 105 Drouot categories, one-to-one FR↔EN, flat (no hierarchy). Largest:
   Asian art 7.2%, Coins and notes 6.6%, Old Masters 5.6%, Rings 5.1%.
5. **Text structure.** ~90% of descriptions begin with the full title; ~1% contain HTML
   entities; descriptions: median 241 chars (FR), P90 752, max 6,185.
6. **Duplicates.** `lot_number` is not unique within an auction (216 groups, 469 lots): sub-lots
   share a number and carry a "1 - " / "2 - " prefix in the title (192 titles). 84 groups of
   identical descriptions (245 lots), e.g. "Lot non venu" (withdrawn). Identical titles are common
   (artist or brand name only).
7. **Auctions.** Dates span 2026-11-01 → 2026-11-07; 85 auction houses. 26 auctions have no
   lots, title, date or house (`catalogue_status = partial`). Auction descriptions are boilerplate.
8. **Currencies.** EUR 17,392 · GBP 2,519 · CHF 651 · SEK 359 — several non-French houses.
9. **Server.** PostgreSQL 18.4; pgvector 0.8.7 **already installed** (schema `public`); pg_trgm
   installed; unaccent and fuzzystrmatch available; `french`/`english` FTS configs present;
   connected user is a superuser with CREATE; schema `auction_search` does not exist.
10. **Other schemas.** `drouot_collector_py` (same layout, 6,696 lots, 1,466 overlapping with the
    source) and `public` (another app's tables, all lot/embedding tables empty). Neither is used.
11. **Live data.** The collector is still writing (latest `updated_at` 2026-11-07 02:56);
    later phases need incremental processing keyed on content hashes / `updated_at`.
12. **Validation targets are sparse.** Footwear: 12 lots in category Shoes, ~38 lots mention
    footwear terms. Louis XIV: 23 lots (5 "époque", 7 "style"); Boulle: 17 lots. Enough to
    demonstrate, too few for robust statistics.

### Decisions taken in Phase 1

| Decision | Reason |
|---|---|
| Python 3.14 (`/opt/homebrew/bin/python3.14`) for `.venv` | System `python3` is 3.9; ≥ 3.11 required. |
| `argparse` CLI | Standard library, `--help` on every command, no extra dependency. |
| Read-only sessions (`default_transaction_read_only=on`) for all Phase 1 programs | Database-enforced protection of the source data. |
| Table/column roles inferred from the catalogue, saved as `source_mapping.json` | Brief requires not assuming names; later phases read the mapping. |
| In-house function-word language detector | Deterministic, no model or network; good enough to measure field-language mismatch. |
| Later-phase libraries declared as optional extras, not installed | Keeps Phase 1 light (no torch / sentence-transformers yet). |
| Reports overwritten on each run (`reports/*.md`, `*.json`) | They are reproducible snapshots; the JSON keeps full detail. |

### Decisions approved before Phase 2 (2026-11-07, "Approve Phase 2" with the recommended answers)

1. Create schema `auction_search` through Alembic migrations that **the user runs by hand**.
2. Link to source lots by `drouot_collector.lots.id` + `(source, lot_id)`, **no cross-schema foreign key**.
3. Ignore `drouot_collector_py`.
4. Use the already-installed `vector` and `pg_trgm` (in `public`); `unaccent` to be raised again in Phase 6.
5. Git: no recommendation was given, so nothing was done — the folder is still not a repository.

## Phase 2 — summary

Delivered: the taxonomy data model (`taxonomy/vocabulary.py`), ORM models (`database/models.py`),
Alembic set-up and migration `0001`, an example seed taxonomy
(`data/taxonomy/example_taxonomy.yaml`), seed validation/loading code, three CLI commands
(`validate-taxonomy`, `load-taxonomy`, `show-concept`), a validation report and 58 new tests
(118 in total). Design: [TAXONOMY.md](TAXONOMY.md); tables: [DATABASE.md](DATABASE.md) §5.

**Database changes:** during the phase the migration ran only inside rolled-back transactions
(tests and `validate-taxonomy --sandbox`). After the phase report it was applied at the user's
request — see "Migration applied" below.

### Validation result

28/28 scenarios pass in the sandbox (`reports/taxonomy_validation.md`): synonyms, translations,
spelling variants and false friends are labels of the right concepts; footwear expands to its 7
subtypes; Louis XIV period and style are separate concepts linked only by `originated_in_period`;
Boulle marquetry is an association, not a synonym; two real lots (7059 "style Louis XIV … XIXe",
6928 "d'époque Louis XIV") are retrieved separately by "made in the period" and "in the style";
PostgreSQL itself rejects 10 kinds of invalid data (including `broader` from a style to a period and
`dated_to` with a style).

### Decisions taken in Phase 2

| Decision | Reason |
|---|---|
| SKOS-style model: concepts + language-tagged terms + typed relationships | Synonyms and translations become labels of one concept, so they can never be confused with associations. |
| Period and style as separate dimensions; lot links carry an *assertion* (`dated_to`, `in_style_of`, `attributed_to`, …) | Required distinction between Louis XIV-period and later Louis XIV-style furniture; mirrors catalogue wording (époque / style / attribué à / atelier de). |
| Allowed relationship and assertion combinations stored as data and enforced by composite foreign keys | The database rejects invalid links without triggers; rules can evolve by migration. |
| Versioning by `introduced_in`/`retired_in` version + `review_status`; `published_*` views | Rows are never deleted; search sees only approved rows of the single published version. |
| Separate `source_category_mappings` table for Drouot categories | A source category can imply several assertions (e.g. "Marbres" → marble sculptures + made of marble) without polluting the vocabulary. |
| `taxonomy_evidence` table now, filled in Phase 3 | Brief requires evidence and source lots for concepts. |
| Seed in YAML (PyYAML added) | Readable and editable by domain reviewers. |
| Seed rows load as `candidate` by default | The example seed was written by Claude and has not been reviewed by an expert. |
| Alembic version table inside `auction_search`; downgrade guarded by an environment variable | Keeps everything out of `public`; no accidental destructive runs. |
| Rolled-back sandbox for validation | Proves the design on the real server without applying it before approval. |

### Migration applied (2026-11-07)

At the user's request ("Apply it for me"), `.venv/bin/alembic upgrade head` was run against
`events_monitor_db`. Result: `alembic current` → `0001 (head)`; schema `auction_search` with 13
tables, 4 views and the lookup data; `drouot_collector` unchanged (5 tables, 20,923 lots, 122
auctions before and after). `load-taxonomy --dry-run` then loaded 176 concepts, 512 terms, 186
relationships and 113 mappings and rolled back; the taxonomy tables are still empty. All 118 tests
and the 28 sandbox scenarios still pass with the schema present. Details: DATABASE.md §5.

Side effect of the dry run: PostgreSQL identity values are not rolled back, so the first real
`load-taxonomy` will create version `0.1.0` with id 2, not 1. Harmless — ids only order versions.

### Seed loaded (2026-11-07)

At the user's request ("Load as candidate"), `load-taxonomy` loaded the example seed into
`auction_search` as draft version `0.1.0` (id 2): 176 concepts, 512 terms, 186 relationships,
113 source-category mappings, all `review_status = candidate`. Published views are empty;
database checks (cycles, FR/EN labels) report no issues; `drouot_collector` unchanged (20,923
lots). Reviewing these candidates and publishing the version will use the Phase 3 review mechanism.

### Decision before Phase 3 (2026-11-07)

AI for ambiguous terms: **"Rules only for now"**. Phase 3 uses no AI provider and no tokens.

## Phase 3 — summary

Delivered: rule-based extraction (`extract-terms`, cached by content hash, resumable), candidate
building with French→English alignment (`build-candidates`), import with evidence
(`import-candidates`), the whole pipeline (`build-taxonomy`), a review mechanism
(`review-taxonomy list/export/apply/approve/reject`) and publication with checks
(`publish-taxonomy`). 29 new tests (147 in total). Design and rules: [TAXONOMY.md](TAXONOMY.md) §7–9.
Report: [reports/taxonomy_extraction.md](../reports/taxonomy_extraction.md).

**Database changes:** rows only, no schema change — draft version `0.2.0` with 952 candidate
concepts, 1,748 labels, 290 relationships and 5,400 evidence rows in `auction_search`. Nothing is
approved or published; `drouot_collector` unchanged (20,923 lots).

### Key findings

1. **Speed and cost:** all 20,923 lots in 16.5 s; 0 AI tokens; re-runs reuse the cache.
2. **Coverage:** 163 of the 176 seed concepts occur in the lots. 1,760 candidates were built; 952
   pass the 0.4 confidence threshold (object types 462, materials 228, makers 140, periods 40,
   styles 39, regions 23, techniques 20).
3. **Useful discoveries:** periods missing from the seed (Restauration → "Restoration period",
   Empire, Consulat, Qing, Kangxi, XVIe/XXe/XXIe siècles), styles (Art Déco, Art nouveau,
   néogothique, Empire, archaïsant), makers (Georg Jensen, Meissen, Cartier, Baccarat, Picasso,
   Warhol…), object types (Bouteille à tabac → "Snuff bottle", Pendentif → "Pendant", Sabre…).
4. **Louis XIV:** 5 lots dated to the period and 7 in the style, with no overlap, so the two
   concepts retrieve different lots. Across reigns the style is far more common than the period
   (Louis XV: 14 period vs 90 style; Louis XVI: 36 vs 95), confirming the distinction matters.
   Boulle marquetry: 18 lots, one with the Louis XIV period (lot 6928, a Sageot commode).
5. **Footwear:** the footwear words in the data are already in the seed; no new footwear type
   reaches the 3-lot threshold ("tennis", "sabots" each occur in 1–2 lots). 9 of 12 *Chaussures*
   lots carry an unambiguous footwear term; the others are spurs and clogs.
6. **Ambiguity is real:** "heels" matched 43 *Arms* lots (rifle heels), "pumps" bicycle/water pumps,
   French "bottes" sheaves of wheat. Mentions are evidence, not classifications — Phase 4 must
   ignore ambiguous terms used alone and weigh where a term appears.
7. **Weak points for reviewers:** 156 candidates lack an English label; some alignments give a
   related word ("Or blanc" → "Carat"); some parents reflect Drouot departments rather than is-a
   ("Pendentif" → necklaces); place names heading coin/photo catalogues can look like makers
   ("Vatican"), though single-auction ones are filtered.

### Decisions taken in Phase 3

| Decision | Reason |
|---|---|
| Candidates go into the existing taxonomy tables as `candidate` rows of a draft version, not into staging tables | The Phase 2 schema already has review status, provenance, confidence, versions and evidence; no new migration needed. |
| Import threshold: confidence ≥ 0.4 (≈ 5+ lots for object heads, 3+ for strong rules) | Keeps the review list to ~950 rows; everything else stays in `candidates.json` and the report. |
| French patterns + English alignment, instead of patterns in both languages | French is the catalogue's source language; every lot has an English text to align with. |
| Fields whose content is in another language are skipped | ~1,700 fields (mostly German text in `description_en`) would otherwise create noise. |
| Culture departments (Asian/Islamic art…) never proposed as parents | They describe origin, not object type. |
| Extraction cache in `.cache/extraction/` (git-ignored), keyed by content hash + extractor version + taxonomy fingerprint | Fast re-runs; any rule or taxonomy change invalidates exactly what it should. |
| Spelling-variant and synonym suggestions reported, not imported | They need a human decision about which concept wins. |

### Review (decided 2026-11-07: "I'll review the CSV")

The user reviews both versions. Prepared for it: `reports/review_0.1.0_seed.csv` (176) and
`reports/review_0.2.0_candidates.csv` (952), with real occurrence counts for seed concepts
(`attributes.attestation`, recorded by re-running `import-candidates`; statuses and labels
untouched), `ambiguous_lots`, `top_categories` and `english_in_data` columns, Excel-friendly
encoding, and a reviewer guide (TAXONOMY.md §7). When the files come back: `review-taxonomy apply
--dry-run`, then apply, then `publish-taxonomy 0.2.0 --dry-run`, then publish.

## Phases 4–10 — summary (2026-11-07/08, "contine and coomplete all phases")

The user asked for the remaining phases to be completed without stopping between them. They were
built and run on the real data **with the unreviewed draft taxonomy** (TAXONOMY.md §7.1), because
the human review of `0.1.0`/`0.2.0` is still in progress. All results below are therefore
provisional; after review and publication, `classify-lots` and `maintain` redo everything with the
published version.

**Database changes (all inside `auction_search`; `drouot_collector` unchanged, 20,923 lots):**
migrations `0002` and `0003` applied (`alembic current` → `0003`); rows in `lot_concepts`
(57,844), `lot_classification_state` (20,923), `lot_search_documents` (20,923), `lot_embeddings`
(20,923), draft version `0.3.0` (24 candidate relationships), `search_demand` attribute on 4
candidate concepts, logs in `search_queries` (22) and `external_search_log` (84). Nothing was
approved or published.

**Other changes on this machine:** sentence-transformers, torch, pgvector, FastAPI, uvicorn and
httpx installed in `.venv` (declared as extras `embeddings`, `api`, `all`); two embedding models
downloaded to `~/.cache/huggingface` (≈ 470 MB each, 928 MB in total; only MiniLM is used).

### Phase 4 — classify existing lots

Delivered `classify-lots`, `enrichment/classification.py`, `classification_job.py`,
`taxonomy/snapshot.py`, migration `0002`, 6 unit tests. All 20,923 lots in ≈ 8 s (0 tokens);
57,844 assertions; 3,220 lots (15.4%) flagged for review (1,710 text vs Drouot category, 1,475
ambiguous term only, 30 conflicting dating, 13 no object). Louis XIV: `dated_to` lots 3672, 6928,
6933, 6934; `in_style_of` lots 6442, 7059, 11346, 11417, 11829, 17758, 18024 — no overlap. Where the
title names an object, it agrees with the Drouot top-level category in 57.8% of lots.
Report: `reports/classification_quality.md`.

### Phase 5 — embeddings

Delivered `benchmark-embeddings`, `build-embeddings`, migration `0003` (pgvector, HNSW). Two local
models compared (0 tokens): `paraphrase-multilingual-MiniLM-L12-v2` chosen (English queries over
French-only text: P@10 0.569 vs 0.375 for `multilingual-e5-small`). 20,923 lots embedded in 99 s
on the Mac GPU; 83.4 MB with the index. Vector search alone confuses period and later style.
Reports: `reports/embedding_benchmark.md`, `reports/embedding_performance.md`.

### Phase 6 — internal hybrid search

Delivered `build-search-index`, `search`, `compare-search`, `serve-api`, `search/hybrid.py`,
`understanding.py`, `index.py`, `api/main.py`. Taxonomy + French/English full-text + semantic,
merged by reciprocal rank fusion; direct vs related; explanations; three modes. On the brief's
examples keyword search on the raw sentence finds 0 lots for all six; hybrid finds 42 / 5 / 23 /
8 / 218 / 1 direct matches. Report: `reports/search_comparison.md`. Live API checked on uvicorn.

### Phase 7 — query expansion

Delivered `expand-query`, `POST /api/search/expand`, `search/expansion.py`: exact / broad /
exploratory depths with priorities 1–4, FR/EN, combined phrases ("Mobilier Louis XIV", "Louis
Quatorze furniture"), de-duplication, limits, cache, ambiguous terms never alone. 0.1–0.3 ms per query.

### Phase 8 — external providers

Delivered the adapter interface (rate limiting, retries with back-off, pagination, normalisation),
orchestrator (filtering, de-duplication, taxonomy validation, attribution, logging),
`search-external`, `POST /api/search/external`. **No real provider is connected** (no API
documentation or credentials were available); providers today: `mock` (18 fictitious lots) and
`local_drouot` (this database). External results never touch the taxonomy (checked by `run-regression`).

### Phase 9 — evaluation

Delivered `evaluate-search`, `data/benchmark/queries.yaml` (20 queries), metrics, judgement pool.
Hybrid broad: P@10 0.795, R@50 0.828, nDCG@10 0.880, MRR 0.967, 34 ms; keyword (content words):
0.525 / 0.432 / 0.582 / 0.710, 1 ms; semantic only 0.445 / 0.345 / 0.463 / 0.642. **Caveats:** the
labels are provisional rules (partly Drouot categories, which the taxonomy channel also uses, so
they favour it); human labels applied: 0; 600 results await judgement in
`data/benchmark/judgements_to_review.csv`. Baseline saved. Report: `reports/search_evaluation.md`.

### Phase 10 — continuous improvement

Delivered `improve-taxonomy`, `run-regression`, `maintain`, `taxonomy/improvement.py`. From the
search log: 12 unresolved terms, 4 matched to existing candidates (search demand recorded), 10
suggestions for a human; 0 translations; 24 co-occurrence relationships proposed as candidates of
draft `0.3.0`. `maintain` (index → reclassify affected lots → embed → regression) ran in ≈ 15 s;
`run-regression` PASS (9.7 s). Reports: `reports/taxonomy_improvement.md`, `reports/regression.md`.

### Decisions taken in Phases 4–10

| Decision | Reason |
|---|---|
| Use a *draft scope* (seed + approved rows) until a version is published, and say so everywhere | The user asked to continue while the review is in progress; unreviewed extracted candidates proved harmful to classification. |
| Classification by position and context, `mentions` for notes | A mention in a long note is not a property of the lot. |
| Local embedding model, chosen by a cross-language benchmark | No paid API; French-only text must be found by English queries. |
| Semantic results feed ranking and related suggestions only | Vector search alone confuses period and style. |
| Soft regions and vague words in broad mode | "French" is often implied; "antique", "vintage" are vague. |
| Mock + local providers only | No provider documentation or credentials; no scraping. |
| Rule-based provisional labels, human labels override | No AI label as ground truth; a human-judgement pool is produced. |
| Phase 10 writes candidates only | Nothing reaches search without review. |

### Known issues

1. Benchmark queries replayed with `--log-queries` are not marked in `search_queries`, so
   `improve-taxonomy` counts them as searches (all 22 logged searches today are tests).
2. The related list ranks partial matches by fused score: for "Louis XIV furniture", non-Louis XIV
   furniture comes before Louis XIV objects that are not furniture (SEARCH.md §3).
3. Broad keyword matches can include notes that mention terms in passing (lot 19259, a painting).
4. 1,710 lots where text and Drouot category disagree need a look (some are classifier errors).

### After Phase 10 — search criteria for APIs (2026-11-08)

Asked by the user: use the taxonomy alone (no lots) to produce complete search criteria for an API.
Found: `search-external` sent an API only the first 12 keywords joined with OR — no furniture word
for "Louis XIV furniture". Now the query becomes ideas × FR/EN keywords (`search/criteria.py`), sent
as `(Louis XIV words) AND (furniture words)`, or combined phrases for APIs without AND
(`expand-query --criteria` shows them). Measured: "commode Louis XV" 4 → 7 direct matches with 106
→ 14 lots fetched; "Chinese porcelain vase" 6 → 108 direct; no non-furniture test lot fetched for
"Louis XIV furniture" (EXTERNAL_APIS.md, "Before and after"). Related fixes: sub-types listed
nearest first (seating/tables were cut alphabetically); same-word labels used in both languages;
the internal keyword channel limited to 10 keywords per idea and language (66 → 33 ms mean, quality
unchanged: P@10 0.800, nDCG@10 0.883); local provider 4 pages per request. Tests: 187 pass;
`run-regression` PASS (exact mode P@10 0.725 → 0.720: one query, "bronze sculpture").

## Open questions

1. **Mark French "Bottes" as ambiguous** in the seed (it also means bundles/sheaves)? Recommended.
2. **Git**: initialise a repository? (still open)
3. **Who labels the benchmark?** `data/benchmark/judgements_to_review.csv` (600 rows) needs a
   person; until then the metrics are provisional.
4. **Which external provider, if any?** Needs its API documentation, terms and credentials.

## Outstanding tasks

- Human review of versions `0.1.0`, `0.2.0` and now `0.3.0` (the user is reviewing the CSVs), then
  `review-taxonomy apply`, `publish-taxonomy`, `maintain`.
- Human relevance labels in `data/benchmark/human_labels.csv`, then `evaluate-search --save-baseline`.
- A real external provider adapter, once access is documented.
- Optional: mark replayed benchmark queries in `search_queries`; rank related suggestions by
  matched group.
