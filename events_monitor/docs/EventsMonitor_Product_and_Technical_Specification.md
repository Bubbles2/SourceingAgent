# EventsMonitor — Product and Technical Specification

**Status:** Proposed greenfield implementation | **Database:** `events_monitor_db` | **Primary deliverable:** A functioning auction and lot discovery application

**Required lot summary field:** `lots.descriptionfactsuk` — a concise, source-grounded UK-English factual summary, generated efficiently during normalization and used for search only where evaluation demonstrates value.

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
- How reliably can `descriptionfactsuk` be generated from bilingual lot descriptions without unsupported claims, and does it improve search retrieval? What schema/indexes are justified by actual data? Which fields are too sparse to deserve typed columns?

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

## 4. Recommended architecture — application-led, n8n-orchestrated

```text
React + TypeScript frontend
          |
     Express API (authentication, validation, search, admin)
          |
  +-------+------------------------+
  |                                |
PostgreSQL events_monitor_db   Node.js background workers
  |                                |
  |                    +-----------+-----------+
  |                    |           |           |
  |                Collection   AI extraction  Embeddings
  |                 adapters     (LangChain*)    batches
  |                    |           |           |
  +--------------------+-----------+-----------+
                       ^
                  n8n orchestration
           schedules, job triggers, alerts
```

*LangChain is optional per operation: use it when structured output, model abstraction or AI chains justify the dependency; otherwise prefer direct provider SDK calls. No autonomous agents in the initial release.*

**Responsibility boundaries:** n8n schedules jobs, triggers services, monitors status and sends alerts. It must not loop over individual lots, perform SQL-heavy ranking, hold large catalogue payloads, or sit on the synchronous search request path. Express provides authenticated APIs; background workers handle long-running work. Node.js TypeScript services perform collection, parsing, hashing, transformation, batching and ranking. PostgreSQL handles transactional storage, indexed full-text and vector search.

## 5. Database and data model

The new database is **`events_monitor_db`**. Inspect the reference schema in read-only mode and retain `auctions` and `lots` column names, types, keys and relationships where practical; document every justified deviation. Do not write to the reference database. Introduce `lots.descriptionfactsuk TEXT`, a concise factual UK-English summary supported by source text, with no invented claims. Preserve original French/other-language text and English translations separately.

Proposed extensions, subject to CSV evidence and schema inspection: `auction_sources`, source-specific identifiers, collection runs/status/errors, category-specific `lot_attributes` (JSONB where suitable), attribute provenance/evidence, `lot_embeddings` with model/version/hash, controlled vocabulary and evaluation fixtures. Support language, country, currency, original estimates, time zones and multiple images. Unique keys should include source identifiers to avoid cross-site collisions. Use parameterized SQL, migrations, indexes based on query plans and least-privilege database roles.

## 6. Data collection and processing efficiency

Use one source adapter per permitted European auction source, starting with Drouot. Prefer official APIs/feeds and structured source data, then ordinary HTML/PDF extraction where permitted; respect access controls, rate limits and terms. Adapters emit a validated common auction/lot contract. Implement bounded concurrency per source, pagination/cursors, HTTP conditional requests where supported, request timeouts, exponential backoff with jitter, idempotent upserts, content hashes, batch writes, resumable checkpoints, dead-letter handling and observable collection completeness. Do not mark a catalogue complete merely because a collection cap was reached.

On unchanged records, skip normalization, embedding and unnecessary database writes. Use background job queues with persisted state; first evaluate a PostgreSQL-backed queue before introducing Redis/BullMQ. n8n starts and monitors coarse-grained jobs only. Track pages fetched, changed lots, skipped lots, failure rates, duration, API/token cost and end-to-end freshness.

## 7. AI normalization and factual summaries

Extract category-specific attributes for furniture, fine art, fashion, jewellery and decorative arts with structured, schema-validated output. Distinguish explicit evidence, inferred attributes, unknowns and contradictions; preserve attribution distinctions such as *by*, *attributed to*, *school of* and *in the style of*. Generate `descriptionfactsuk` in the **same normalization request** when AI is needed, rather than an additional model call. Use deterministic extraction or translation where it is reliable and measurable. Validate that summaries are concise, UK-English, evidence-grounded and preserve period/style distinctions. Store source-content hashes and model/prompt versions, and prevent stale worker results from overwriting newer descriptions.

## 8. Search architecture

Keep catalogue discovery separate from lot discovery. Parse queries into required attributes, preferences, exclusions, auction date filters, estimate filters and search intent. Use bilingual/multilingual specialist synonyms without conflating related but distinct terms. PostgreSQL combines full-text, pgvector, structured filters and fuzzy maker/artist matching. Merge candidates and rank deterministically first; use selective AI reranking only when ambiguous. Label results **confirmed**, **possible** or **related**, with per-lot evidence and unconfirmed attributes. Related items must not be presented as matching mandatory constraints. Measure whether `descriptionfactsuk` improves retrieval; do not assume it should dominate source text.

The React UI displays auctions, lots, explanations, images, source links, original descriptions, `descriptionfactsuk`, filters for source/country/language/date/estimate and coverage/freshness notices. All browser requests go through Express; secrets stay server-side. Search must not trigger n8n executions.

## 9. Evaluation and acceptance

Before database implementation, profile **two representative CSVs**: (1) auction titles/descriptions in French and English; (2) lot titles/descriptions in French and English. Record missingness, categories, translation inconsistencies, provenance and specialist terminology. Build a manually labelled benchmark of confirmed, possible, related and irrelevant results, including broad queries such as 'shoes' and nuanced historical attribution queries. Compare keyword, semantic and hybrid retrieval on precision@K, recall@K, ranking quality, latency and cost. Use separate fixtures for incomplete/contradictory records and additional European languages as available.

Acceptance requires: no writes to reference systems; stable repeat collections with near-zero work for unchanged records; resumable partial failures; source-specific rate limits; correct evidence handling; no exposed secrets; validated API inputs; baseline search quality and latency measurements; and documented results for the AI-versus-deterministic processing trade-offs. Establish quantitative thresholds from the CSV benchmark, rather than inventing targets before measurement.

## 10. Scope and delivery principles

This is a **new application**, not a migration or refactor. Build in the current project folder without an unnecessary wrapper directory. Prefer small TypeScript modules, automated tests, explicit interfaces, minimal dependencies and versioned migrations. Start with CSV analysis and a mock-data React UI; obtain approval at architecture, schema and UI checkpoints. Configure schedules but leave them inactive until approved. Keep source integrations independently deployable/testable and document their collection permissions and limitations.
