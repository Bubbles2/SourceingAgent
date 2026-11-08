# EventsMonitor — Revised Product Specification and Phased Codex Build Prompts

**Status:** Proposed greenfield implementation | **Database:** `events_monitor_db` | **Primary deliverable:** A functioning auction and lot discovery application

## 1. Introduction: purpose and objective

EventsMonitor is a new application for buyers, dealers and sourcing agents who want to discover objects offered at auction, initially focusing on French auction houses and catalogues while preparing for expansion to other European auction sites. Its core purpose is to turn fragmented, inconsistently described auction information into an accessible, searchable catalogue of auctions and individual lots. Users should be able to describe what they seek in ordinary French or English initially, with a language-extensible design and discover genuinely relevant items, including objects whose catalogue descriptions use specialist terminology, omit details or express uncertain attributions.

The application must answer two distinct kinds of questions: **which upcoming auctions are relevant?** and **which individual lots match my requirements?** For example: “Which upcoming Paris auctions include antique furniture?”, “Find Louis XV giltwood armchairs under €3,000”, “Find women's designer shoes”, and “Show 19th-century French landscape paintings”. Results must identify the auction, lot, estimate, date and original source, and explain what is confirmed, what is uncertain and what is merely related.

**European expansion requirement:** New auction sites in France and elsewhere in Europe must be addable through isolated source adapters and configuration, without rewriting core search, normalization, API or UI logic. Initially implement and validate one permitted source; do not build unneeded integrations in advance.

**Central design principle:** EventsMonitor is a discovery system, not a binary keyword verifier. It should find and rank useful objects without inventing facts or disguising uncertainty. The project is a completely new build, not a modification, migration or runtime extension of any earlier application. It has its own database, workflows, server/API and React interface.

### Intended users and boundaries

Initial users are auction buyers, dealers and sourcing agents who need efficient catalogue research. The initial product covers auction discovery, catalogue indexing, lot discovery, search filters, result explanations and original-source links. Bidding requests, payment, escrow, shipping, customer accounts and automated purchases are **not included in this initial build**; they can be separately specified later.

### Definition of success

A buyer can search natural-language French or English, discover relevant auctions and lots, distinguish confirmed/possible/related results, inspect original evidence, and navigate to the original catalogue. Search quality, coverage, latency and AI costs are measurable. The implementation is maintainable and independent.

## 2. Why sample CSVs must be analysed before designing search

**Mandatory Phase 0:** use two real, representative CSV files as a discovery, prototyping and evaluation resource *before* freezing the schema or implementing production n8n search workflows.

1. **Auction CSV:** auction titles and descriptions in French and English, preferably with auction identifier, house, date, catalogue/source URL and category when available.
2. **Lot CSV:** lot titles and descriptions in French and English, preferably with auction identifier, lot identifier/number, estimate, category, maker/artist, image/source URL and other available fields.

Where available, include `source_name`, `source_auction_id`, `source_lot_id`, `country`, `language`, `currency`, and `source_url` in both datasets. The importer must accept source-specific column mappings and preserve original values. When samples from other European countries become available, add them to multilingual regression tests without changing the canonical schema.

The files may contain fewer columns. The first task is to inspect actual headers and data types; **never assume the proposed headers exist**. The French and English texts may be human translations, AI translations or independently authored descriptions; determine their provenance where possible. Preserve raw text and flag missing or unreliable translations. Never invent a translation and silently treat it as source evidence.

### Questions the analysis must answer

- What proportion of auctions/lots have usable titles, descriptions, dates, estimates and identifiers? How much text is missing, duplicated, inconsistent or malformed?
- Which French/English auction terms, specialist synonyms, abbreviations, spelling variants and category names actually occur? Which are equivalent and which are only related?
- Which category-specific attributes can be extracted reliably: furniture style, period, maker, materials; art artist/attribution, medium, subject; fashion brand, object type, colour, size; jewellery and decorative-art attributes?
- How often are descriptions explicit, inferred, unknown or contradictory? Can the system distinguish “époque Louis XV” from “style Louis XV”, and “by” from “attributed to” or “after”?
- Can a simple bilingual vocabulary plus full-text and structured filtering solve common queries? Where do embeddings or additional AI interpretation demonstrably improve retrieval?
- Which auction-level features predict relevant catalogues: auction title, summary, category distribution, indexed lot content, date and coverage?
- What schema/indexes are justified by actual data? Which fields are too sparse to deserve typed columns?

### Required CSV analysis outputs

Produce `docs/00-csv-data-profile.md`, `docs/00-vocabulary-and-attributes.md`, `docs/00-search-experiments.md`, `data/processed/` reproducible derived files, and `tests/fixtures/` representative, sanitized samples. Report measured counts and percentages, with denominators; do not fabricate findings before files are provided.

Use a labelled evaluation set covering both auction searches and lot searches. Select representative real examples and manually review relevance labels: **Confirmed, Possible, Related, Non-match**. Include difficult examples, missing data, negation, reproductions, contradictory periods, misspellings, broad terms such as “shoes”, and bilingual synonyms. Prevent leakage: do not use the evaluation labels to tune a method and then report its score as an unbiased final test. Maintain a held-out evaluation subset.

### Search experiments before database build

Test progressively: (A) lexical/keyword matching, (B) controlled bilingual synonym expansion, (C) structured attribute matching, (D) semantic embeddings, and (E) hybrid ranking. Compare Precision@K, Recall@K, ranking usefulness, false positives, latency and approximate API cost on the same labelled queries. An initial Python prototype over CSVs is acceptable, but **validate the chosen design again in PostgreSQL**, since its indexes and query plans differ. The experiment should justify which AI calls are needed and which are unnecessary.

**Gate:** Do not finalize search metadata schema or production ranking until the CSV analysis, baseline tests and proposed retrieval design have been reviewed. If the CSVs are not yet available, create only the analysis scaffolding and clearly stop at this gate; do not invent findings.

## 3. Product behavior and search rules

### Two search modes

**Auction discovery:** identify upcoming or selected auctions whose title, descriptions and indexed lot contents indicate relevant inventory. Rank with awareness of collection completeness and auction date. Do not claim an auction has no relevant objects when its catalogue is only partially collected.

**Lot discovery:** identify individual lots using original/translated descriptions, normalized attributes, specialist vocabulary, full-text matching and embeddings. Permit filters for category, auction date, house, estimates, object period and relevant category-specific properties.

### Search intent and constraints

Parse user text into intent, object/category, essential conditions, preferences, exclusions, estimate limits, auction date constraints and object-production periods. Do not silently add constraints. Distinguish the auction date from the object's historical period. For “Louis XV armchairs, preferably giltwood, under €2,000”, armchair and Louis XV are essential, giltwood is preferred and the price constraint must explicitly say whether it refers to low or high estimate; use a clearly labelled high-estimate default only if the UI/API contract defines it.

### Result categories

- **Confirmed:** all essential criteria have reliable supporting source evidence.
- **Possible:** relevant object, with one or more essential attributes unconfirmed but no explicit contradiction of essential criteria.
- **Related:** similar object that fails or contradicts an essential criterion; show separately.
- **Non-match:** not returned as a matching result, but retained in evaluation datasets.

A “Louis XVI style” chair is not a confirmed “Louis XV period” chair. An inference cannot become a confirmed fact. Show evidence snippets and missing/contradictory attributes, not uncalibrated confidence percentages.

### Search result fields

Lot/auction identifiers, title, French/original and English text where available, category, house, auction date, lot number, estimate currency and low/high values, image/source/catalogue URL, match category, evidence-backed explanation, uncertain attributes and catalogue coverage. Missing data stays missing. Show clearly whether estimates are estimates, not realized prices.

## 4. Target architecture

```text
Two representative bilingual CSVs
        |  profiling -> vocabulary -> labelled evaluation -> retrieval experiments
        v
Approved data/search design
        |
Permitted European auction sources -> independent source adapters -> canonical validation
                                      -> n8n collection queue -> PostgreSQL events_monitor_db
                                                   | auctions + lots
                                                   | metadata + evidence
                                                   | embeddings + collection status
                                                   v
                                     n8n normalization / embedding jobs
                                                   |
React + TypeScript -> secure server API -> query interpretation
                                                   |
                                  auction search OR lot search
                                                   |
                       full-text + structured + synonyms + pgvector
                                                   |
                             evidence-based relevance/ranking
                                                   |
                               JSON/CSV -> React result views
```

Use **React + TypeScript** for the UI; a small server-side API/backend-for-frontend for authentication and orchestration; **n8n** for collection, asynchronous normalization and embeddings (and search orchestration where useful); **PostgreSQL** for canonical data and full-text search; **pgvector** for vectors; **OpenAI** for validated extraction, embeddings and complex query interpretation when justified. Avoid extra infrastructure unless a benchmark or clear requirement supports it. Prefer database-native search operations to chains of expensive per-result AI checks.

## 5. Database design and reference compatibility

Create a separate PostgreSQL database named **`events_monitor_db`**. Use the unquoted SQL identifier `events_monitor_db` (for example, `CREATE DATABASE events_monitor_db;`). Keep **`auctions`** and **`lots`** structurally compatible with the existing reference schema wherever practical. Before implementing, inspect the actual reference schema **read-only** and record its exact DDL, keys, column types, indexes, unique constraints, source IDs and relationships. The supplied planning documents do not include that full DDL; compatibility cannot be asserted without inspection. No application runtime connection to the reference database is permitted.

Additions must be justified by the CSV profile and use additive tables/columns where possible. Include a minimal `auction_sources` registry and source-specific identifier mapping (in columns or a mapping table, as justified). Preserve source country, source language, timezone, currency and provenance; use collision-safe source-scoped uniqueness and deduplicate cross-listed auctions conservatively. Candidate supporting tables: `lot_attributes` (or a coherent `lot_search_metadata` design, not both redundantly), `lot_attribute_evidence`, `lot_embeddings`, `auction_search_metadata`, `collection_runs`, `auction_collection_status`, `collection_errors`, `search_vocabulary`, and `search_evaluations`. Use typed columns for frequently filtered values, JSONB for variable category-specific fields, proper foreign keys and source uniqueness, and versioned migrations. Record content hashes, model versions and evidence provenance. Separate original from translated/normalized text.

**Isolation:** dedicated database credentials, explicit database-identity checks before writes, distinct n8n workflows, routes and environment configuration. Do not drop, rename or mutate any reference-system objects. Start with an empty new database and import CSV fixtures only with explicit validation and provenance.

## 6. Collection, AI processing and API

**Collection:** start with one Drouot adapter only where access is permitted, but implement a stable source-adapter contract: discover auctions, fetch auction metadata, enumerate catalogue pages/lots, map fields to canonical records, and report cursors, provenance, completeness and errors. Other European sources must be pluggable without changes to core processing. Prefer permitted official APIs, feeds and structured data over expensive browser automation or AI extraction; use HTML/PDF extraction only when necessary and permitted. Queue auction/catalogue jobs; collect auction and lot records; use idempotent upserts, bounded retries, pagination, resumability, completeness tracking and error logs. **Efficiency is an acceptance criterion:** use incremental discovery and source timestamps/ETag/Last-Modified where supported; compare content hashes before downstream processing; avoid refetching unchanged catalogues; use bounded concurrency and adaptive per-source rate limits; batch writes; cache safely; prioritize imminent/changed auctions; resume from checkpoints; use inexpensive deterministic parsers before AI and measure fetches, bytes, lots/minute, cost/lot and completeness. Do not sacrifice coverage, provenance or source compliance to improve speed. Initial configurable safeguards: four auctions/run, three pages/auction and 300 lots/auction; reaching a cap does **not** mean a catalogue is complete. Scheduling remains inactive until approved.

**Normalization:** process only new/changed lots, with original language retained and a language-extensible normalized representation. Produce schema-validated JSON with category-specific attributes and evidence states `explicit`, `inferred`, `unknown`, `contradictory`. Preserve supporting source text. Distinguish period from style, original maker from attribution/follower, and reproduction from original. Never fabricate missing data. Use a content hash and model/prompt version for incremental processing.

**Embeddings:** build concise searchable text from reliable fields, not catalogue boilerplate; persist vector model/dimensions/version and content hash. Re-embed changed content only. Never mix incompatible vector models in one index.

**Search:** controlled French/English vocabulary, deterministic filters, PostgreSQL full-text, fuzzy maker/artist matching, pgvector semantic retrieval and category-specific attributes. Start with reciprocal rank fusion as a measurable baseline, not a guaranteed winner. Test candidate limits (40/80/100/200) against labelled data. Use AI reranking only for ambiguous cases. Keep auction search and lot search distinct.

**API/UI:** versioned, authenticated server endpoints for auction search, upcoming auctions, lot search and lot details; pagination and JSON/CSV export. Browser code must never contain n8n, database or OpenAI secrets. Use parameterized SQL, input validation, request limits, rate limiting where supported and safe errors. UI: responsive light theme with blue accents, accessible cards, filters, original/translated descriptions, source links, match explanations, coverage indicators and empty/error/loading states. Approve an interactive mock-data UI before complex integration.

### Collection efficiency and European expansion acceptance criteria

- Adding a second permitted auction website should require a new adapter, source configuration, mappings and tests—not edits to shared retrieval or ranking logic.
- Each adapter declares capabilities (API/feed/HTML/PDF, pagination, update markers, languages, currencies, time zones and collection restrictions); missing capabilities must degrade gracefully.
- Do not assume a single country, language, currency, source ID namespace or auction time zone. Preserve original estimate currency; convert only for explicitly labelled display/filtering with a dated FX rate.
- For each collection run, report auctions discovered/changed, pages fetched/skipped, lots inserted/updated/unchanged, duplicates, failures, coverage, elapsed time, network requests, AI calls and estimated cost.
- Benchmark an initial full import and a no-change incremental rerun. The second run should avoid unnecessary downloads, database writes, normalization and embedding calls. Set measurable thresholds after profiling actual sources; do not invent performance targets.
- Maintain compliant throttling, timeouts, bounded retries, backpressure and checkpoint recovery. Source restrictions override speed targets.

## 7. Development discipline for Codex

The following prompts are **sequential, standalone execution instructions**. For every phase: inspect the current folder and project instructions; do not create an extra enclosing project folder; make the smallest coherent change; keep modules focused and readable; avoid unapproved dependencies; never hard-code secrets; create runnable tests; document commands and results; and stop at the specified checkpoint. Treat the CSV files and reference schema as inputs to inspect, not as grounds for assumptions. Do not automatically activate an n8n MCP server; inspect local JSON/configuration first and use external validation sparingly when required.

---

# Part II — Copy-and-paste Codex prompts

## PHASE 0A — Inspect and profile the two CSV datasets

**Prompt:**

> We are building **EventsMonitor** as a new, independent auction and lot discovery application. Work in the **current folder**; do not create a new parent folder. First inspect repository instructions and locate the two user-provided CSVs: (1) auction titles/descriptions in French and English; (2) lot titles/descriptions in French and English. Do not assume filenames or headers. If either file is missing, report the exact missing input and create only safe scaffolding; do not fabricate data or findings. Inspect encoding, delimiter, headers, data types, identifiers, duplicates, missingness, bilingual coverage, text length, dates, estimates, categories, and linkage between auctions and lots. Preserve raw files unchanged. Write reproducible, small Python analysis scripts and tests. Produce `docs/00-csv-data-profile.md` with measured counts, examples, limitations and recommended data-cleaning rules; put derived outputs under `data/processed/`. Do not create the production database, n8n workflows or API yet. Stop after reporting findings and request approval.

**Exit:** Real, reproducible CSV profile; clear data issues; no unsupported assumptions.

## PHASE 0B — Build bilingual vocabulary and extraction specification

**Prompt:**

> Use the inspected CSVs and Phase 0A outputs. Design terminology mappings for future European languages beyond French and English; do not assume translations are exact equivalents. Extract recurring object categories, French/English terms, spelling variants, maker/artist names, materials, styles, periods and category-specific attributes. Build a controlled vocabulary with explicit relationship types: exact translation, synonym, broader/narrower term and related-but-not-equivalent. Demonstrate difficult distinctions such as `époque Louis XV` versus `style Louis XV`, attributed versus made by, and footwear terms such as `escarpins`. Evaluate how often each attribute is actually present, unknown or ambiguous; report counts with denominators. Propose schema-validated normalization JSON for furniture, art, fashion, jewellery and decorative arts, including per-attribute source evidence and evidence status. Create `docs/00-vocabulary-and-attributes.md`, versioned vocabulary data and validation tests. Do not invent missing attributes. Stop for review.

**Exit:** Evidence-based vocabulary and normalization contracts.

## PHASE 0C — Establish a labelled search benchmark and compare retrieval methods

**Prompt:**

> Use the two CSVs to build representative **auction-level and lot-level** search test sets. Include English and French queries, broad terms, synonyms, brand/artist names, period/style distinctions, misspellings, explicit exclusions, partial descriptions, uncertain attributions and zero-result cases. Create a manual-reviewable relevance-label file with Confirmed/Possible/Related/Non-match and explain each label using source evidence. Keep a held-out test split. Implement a lightweight prototype comparing keyword search, bilingual expansion, structured filters, embeddings (if credentials and approval are available), and hybrid retrieval. Never send data to an external AI service without verifying permission and configuration; provide a non-AI baseline regardless. Measure Precision@K, Recall@K, ranking quality, latency and approximate AI cost. Produce `docs/00-search-experiments.md` and a recommendation explaining which search features measurably help. This is a **prototype**, not the production engine. Stop for approval before database design.

**Exit:** Labelled benchmark, reproducible comparison and justified retrieval approach.

## PHASE 1 — Final architecture and schema proposal

**Prompt:**

> Design EventsMonitor using the approved CSV analysis and search experiments. Make the canonical data model source-independent and European-ready: source registry, source-scoped IDs, languages, country, currency, timezone, source provenance and per-source adapter contracts. Specify the lowest-cost compliant collection strategy, incremental update markers, hash-based change detection, job priorities, caching, batching and collection-efficiency metrics. Inspect the reference PostgreSQL schema **read-only** and document the exact `auctions` and `lots` table definitions, relationships, keys, constraints and indexes. If access is unavailable, mark exact schema compatibility as unresolved; do not invent the DDL. Propose the independent database `events_monitor_db`, preserving core table compatibility where practical and documenting each justified improvement. Design minimal supporting tables for search metadata/evidence, embeddings, vocabulary, collection state and evaluation. Specify n8n workflow responsibilities, secure API contracts, data flow, source provenance, incremental processing and database isolation. Produce `docs/01-architecture.md`, `docs/01-schema-design.md`, `docs/01-reference-compatibility.md` and an architecture diagram. No database writes. Stop for approval.

**Exit:** Approved architecture and reproducible schema proposal.

## PHASE 2 — React UI prototype with mock data

**Prompt:**

> Create a minimal React + TypeScript frontend in the **current project folder** (do not nest it in another project folder). First inspect existing files and dependencies. Build three navigable views: Lot Search, Catalogue Search and Upcoming Auctions, plus a lot-detail view. Use clearly labelled mock data and a clean, bright, blue-accented design. Include search bar, filters, cards, Confirmed/Possible/Related badges, original/English descriptions, evidence explanations, source links and loading/empty/error states. Keep components small and API concerns separate. Add accessibility and basic tests. Present the working UI for approval before connecting it to backend services. Do not expose secrets or build complex backend code yet.

**Exit:** Reviewable, usable UI prototype.

## PHASE 3 — Create and validate the database

**Prompt:**

> Implement the approved schema in the new PostgreSQL database named `events_monitor_db`. Verify whether the database already exists; never overwrite it without approval. Use the exact database identifier `events_monitor_db` consistently. Use versioned, repeatable migrations, required extensions and indexes. Reproduce the approved compatible `auctions` and `lots` structures and add only approved search/evidence/collection tables. Create a dedicated least-privilege connection, check database identity before every write workflow, and provide a clean install/rollback procedure. Import a **validated copy** of sample CSV records as fixtures, preserving source text and auction-lot links; do not alter raw CSVs or the reference database. Test keys, upserts, constraints, indexes, full-text retrieval and pgvector compatibility. Deliver migrations, tests and `docs/03-database.md`. Stop after validation.

**Exit:** Isolated, reproducible database populated with traceable fixtures.

## PHASE 4 — Auction and lot collection workflows

**Prompt:**

> Build new importable n8n workflows under `n8n/` with a generic source manager/queue and a Drouot-specific adapter where access is allowed. Define and test a documented adapter interface so future European sites can be added without modifying shared search or normalization. Prefer official APIs/feeds and structured endpoints where permitted, then deterministic HTML/PDF parsing; reserve AI extraction for truly unstructured cases. Implement change detection using available source update markers, conditional requests and content hashes; skip unchanged pages and lots; batch database writes, bound per-source concurrency, use resumable checkpoints and record fetch/processing costs. Benchmark full and unchanged incremental runs. Implement source discovery, auction queue, catalogue pagination, lot extraction, idempotent upserts, retries with bounded backoff, resumable cursors, collection statistics and partial/failed status. Use the new database only and verify its identity before writes. Start with configurable safety caps of four auctions per run, three pages per auction and 300 lots per auction; never mistake hitting a cap for complete collection. Respect rate limits, source terms and access controls. Keep schedules disabled. Test new, changed, duplicate, missing and interrupted records using fixtures. Deliver workflow JSON, tests and `docs/04-collection.md`. Do not activate production schedules.

**Exit:** Reliable, isolated collection with honest coverage status.

## PHASE 5 — Category-aware bilingual normalization

**Prompt:**

> Build `events-monitor-normalization` as a focused n8n workflow. Make extraction language-extensible beyond the initial French/English coverage, and preserve source language and original wording. Use the Phase 0 CSV findings, vocabulary and approved category schemas. Process only new/changed lots, preserve original French/English text and write structured category attributes plus source evidence. Distinguish explicit/inferred/unknown/contradictory attributes; never convert an inference to fact. Handle period versus style, maker versus attribution, original versus reproduction and French specialist terms. Validate AI JSON against schemas, reject malformed output, retry recoverable errors and log token/cost metrics. Version prompts and content hashes. Test representative real CSV examples, edge cases and interrupted runs. Deliver workflow JSON, tests and `docs/05-normalization.md`.

**Exit:** Accurate, traceable metadata with incremental processing.

## PHASE 6 — Embeddings and database search indexes

**Prompt:**

> Build `events-monitor-embeddings` to generate and store vectors for new/changed normalized lot records using the approved embedding model. Construct concise searchable text from supported descriptions, categories and attributes; avoid irrelevant boilerplate. Record model, dimensions, input hash and processing version; never mix incompatible models. Add/test approved PostgreSQL full-text, structured, fuzzy and vector indexes using real CSV-derived fixtures. Benchmark query plans and index behavior. Test reruns, changes, errors and recovery. Deliver workflow JSON, SQL migrations if needed, benchmarks and `docs/06-indexes.md`.

**Exit:** Reliable incremental indexes and measured retrieval performance.

## PHASE 7 — Query interpretation and hybrid search

**Prompt:**

> Implement natural-language interpretation and hybrid search for both **auction discovery** and **lot discovery**, using the Phase 0 benchmark and approved retrieval strategy. Parse essential criteria, preferences, exclusions, auction dates, object periods and explicit estimate semantics; do not invent constraints. Combine controlled bilingual vocabulary, PostgreSQL full-text, structured filters, fuzzy matching and pgvector. Evaluate reciprocal rank fusion and configurable candidate limits (40/80/100/200) against labelled tests. Classify results as Confirmed, Possible or Related using evidence; an explicit contradiction of an essential criterion cannot be Possible or Confirmed. Return explanations, missing attributes and source evidence. Reserve AI reranking for ambiguous cases, not every result. Handle partial catalogue coverage and empty results honestly. Deliver modular code/SQL, n8n search orchestration only where justified, tests and `docs/07-search.md`.

**Exit:** Tested retrieval and graded relevance, with benchmark results.

## PHASE 8 — Secure API and frontend integration

**Prompt:**

> Build a small authenticated server-side API for lot search, auction search, upcoming auctions and lot details. Integrate the approved React UI with the search service and n8n operations. Add country, source and currency-aware filters and a basic source-health/admin view; avoid exposing secrets or internal source configuration. Keep all n8n, OpenAI and PostgreSQL secrets server-side. Use parameterized SQL, validated input, rate/request limits, pagination, JSON responses and optional CSV export. Include auction coverage, evidence, bilingual descriptions and match classifications in the API contract. Test unauthorized requests, injection attempts, missing data, pagination, failures and zero-result behavior. Deliver API documentation and end-to-end browser tests.

**Exit:** Secure, functional browser-to-search workflow.

## PHASE 9 — Quality, reliability and performance acceptance

**Prompt:**

> Run a full evaluation against the **held-out** CSV-derived auction and lot query sets. Report Precision@K, Recall@K, confirmed-match precision, false positives/negatives, ranking quality, latency, SQL timings, AI calls/cost, catalogue completeness and failure recovery. Test French/English search, uncertain attributes, period/style contradictions, empty results, partial catalogues, stale indexes, auth failures and database/API outages. Compare results to the Phase 0 baselines; explain regressions and propose minimal fixes. Set quantitative acceptance thresholds from measured baseline and user-approved requirements, not invented targets. Produce `docs/09-quality-report.md` with reproducible commands and remaining risks. Do not claim success without test evidence.

**Exit:** Measured acceptance report and corrected critical failures.

## PHASE 10 — Documentation, backups and controlled activation

**Prompt:**

> Prepare EventsMonitor for routine local operation and optional later deployment. Write a setup guide, architecture map, environment variable template (no secrets), workflow import instructions, database migration and backup/restore guide, source-access compliance notes, API reference, troubleshooting and monitoring checklist. Verify backup restoration, collection status visibility, indexing backlogs, search latency and AI-cost metrics. Keep recurring schedules, retention/deletion and external exposure **disabled until explicitly approved**. Provide a concise handover checklist and demonstrate a complete permitted auction-to-lot-to-search flow.

**Exit:** Documented, recoverable system ready for an explicit go-live decision.

---

## 8. Global safeguards and acceptance checklist

- Build a new application; do not modify or depend on any existing application at runtime.
- Use only `events_monitor_db` for new application writes; inspect the reference schema read-only.
- Do not claim the reference schema is identical until actual DDL has been checked.
- Do not fabricate CSV contents, translations, provenance, auction dates, estimates or lot attributes.
- Keep raw CSVs intact; derived files must be reproducible and traceable.
- Use both auction-level and lot-level CSV data to evaluate both search modes.
- Make the bilingual vocabulary evidence-based and distinguish exact synonyms from related concepts.
- Never treat unknown or inferred attributes as proven; separate Related results.
- Use deterministic search where effective; justify extra AI calls with measured benefits.
- Keep secrets out of browser code, source control, prompts and logs.
- Respect auction-source terms, rate limits and catalogue/image usage rights.
- Keep workflows modular; avoid activating n8n MCP automatically.
- Require approval at CSV-analysis, architecture, UI and go-live checkpoints.

## 9. Recommended first action

Provide the **auction CSV** and **lot CSV**. Start with **Phase 0A**, then complete **0B** and **0C** before approving the schema. If the files are not yet available, Codex should wait rather than design a search system based on fictional data. The output of these phases becomes the factual basis for the remaining build.
