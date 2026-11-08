# EventsMonitor — Consolidated Application Specification

**Status:** Proposed greenfield design  
**Purpose:** Single product concept and phased implementation blueprint  
**Database:** `events-monitor_db`

## 1. Executive summary

Build **EventsMonitor**, a new, independent auction catalogue discovery and natural-language search application. It collects auction and lot information, enriches inconsistent French and English catalogue descriptions, and helps users find art, furniture, fashion, jewellery and decorative objects through useful, evidence-backed results.

The defining improvement is **discovery with transparent uncertainty**: results are grouped as **Confirmed**, **Possible** or **Related**, instead of rejecting potentially interesting lots merely because catalogue text omits a requested detail. The application also separates searching **auctions/catalogues** from searching **individual lots**.

This is a **greenfield build**, not a refactor, migration or extension of the existing EventsMonitor. The reference system is used only to inform design decisions; the new product is independently implemented.

## 2. Product goals and boundaries

### Primary goals

- Discover and index relevant upcoming auction catalogues, starting with Drouot where permitted.
- Search individual lots using natural-language French or English queries.
- Find exact and semantically similar objects without confusing distinct historical styles, makers or brands.
- Display original catalogue evidence, translated/normalized descriptions and clear reasons for relevance.
- Track catalogue completeness and incremental updates so users understand coverage.
- Minimize unnecessary AI calls without compromising retrieval quality.
- Deliver a responsive, simple React interface and an authenticated API.

### Initial scope

Furniture and antiques, fine art, fashion and luxury accessories, jewellery, decorative arts and other catalogue categories. Support auction discovery, upcoming-auction browsing, lot search, filters, lot details and source links.

### Not in the initial scope

Automated bidding, payments, escrow, shipping management, customer accounts/marketplace operations, autonomous purchasing and sale-price prediction. These require separate specifications and approval.

## 3. Core user experience

Users can ask:

- “Find Louis XV giltwood armchairs.”
- “Show Chanel handbags with a high estimate below €2,000.”
- “Find women's designer shoes.”
- “Which upcoming auctions include French antique furniture?”
- “Show 19th-century French landscape paintings.”
- “Find furniture similar to André-Charles Boulle designs.”
- “Find Chanel handbags in auctions next week.”

The application identifies whether the user wants **auctions/catalogues** or **lots**, parses explicit constraints and preferences, searches the appropriate records, and displays ranked results with explanations.

### Result classes

| Class | Meaning | Example for “Louis XV giltwood armchair” |
|---|---|---|
| **Confirmed** | Every essential requirement is supported by reliable source evidence | “Fauteuil en bois doré, époque Louis XV” |
| **Possible** | Relevant object, but one or more essential properties are unconfirmed and none is explicitly contradicted | “Antique French giltwood armchair” |
| **Related** | Similar or potentially interesting but fails or contradicts an essential requirement | “Louis XVI giltwood armchair” |

Related items must appear separately, never disguised as matches. Missing evidence is not positive evidence. Avoid numerical confidence percentages unless calibrated against labelled data.

### Lot result presentation

Show image, title, auction house, auction date, lot number, estimate, category, original description, English description, source/catalogue link, matched attributes, unconfirmed attributes, contradictions where applicable, and a short evidence-backed explanation. Clearly label partial catalogues and missing source information. Never invent values.

## 4. Unified architecture

```text
Permitted auction sources (initially Drouot)
                  |
                  v
        Collection queue / scheduler
                  |
                  v
       n8n collection and recovery
                  |
                  v
  PostgreSQL: events-monitor_db
        auctions <----> lots
                  |
                  v
    Category-aware AI normalization
       + provenance / evidence
                  |
                  v
    Embedding generation (pgvector)
                  |
                  v
     Searchable lot and auction indexes
                  ^
                  |
React UI -> secure server API -> query interpretation
                                |
                      +---------+---------+
                      |                   |
                Auction search         Lot search
                      |                   |
                      +---------+---------+
                                |
                  Hybrid candidate retrieval
                  (vector / full-text /
                  structured / synonyms)
                                |
                  Evidence-based relevance
                                |
                  Confirmed / Possible / Related
                                |
                         JSON / CSV response
```

**Technology choices:** React + TypeScript for the interface; a small server-side API/backend-for-frontend to protect credentials; n8n for collection and asynchronous AI workflows; PostgreSQL for canonical data and full-text search; pgvector for embeddings; OpenAI for normalization, embeddings and interpretation when useful. Do not add a separate vector database or other major services without demonstrated need.

The application should be operable locally and have clear configuration for later deployment.

## 5. Data design

Use the new database **`events-monitor_db`**. Its `auctions` and `lots` tables must follow the reference database schema as closely as possible, with targeted improvements where justified. The source material does not include the complete SQL DDL, so inspect the reference schema read-only before claiming exact compatibility.

**Design decision:** implement a clean new schema with `auctions` and `lots` as stable core entities. Inspect the reference PostgreSQL schema *read-only* and reproduce the `auctions` and `lots` table definitions (column names, types, keys, identifiers, constraints and relationships) as the default starting point. Make improvements only when justified and documented, preferably through additive tables or columns. The new application must not depend on the reference database at runtime. If its DDL cannot be inspected, record this as a blocking compatibility verification item and obtain approval for a provisional schema.

### Logical tables

| Table | Responsibility |
|---|---|
| `auctions` | Auction identity, house, title, date, location, catalogue/source URLs and status |
| `lots` | Auction-to-lot relationship, source lot identifier/number, original and translated text, estimates, image/source URLs |
| `lot_search_metadata` or `lot_attributes` | Structured category-specific searchable data; choose one coherent design, not redundant copies |
| `lot_attribute_evidence` | Source-backed attributes, evidence status, source field and supporting passage |
| `lot_embeddings` | Vectors, embedding model/version and content hash |
| `collection_runs` | Collection job history and statistics |
| `auction_collection_status` | Pending/collecting/complete/partial/failed and coverage counts |
| `collection_errors` | Retryable and terminal collection failures |
| `search_evaluations` | Labelled search-quality test fixtures and results |

Optional `search_queries` diagnostics should be privacy-conscious, configurable and retention-limited. Favor typed columns for common filters, JSONB for variable category-specific attributes, and PostgreSQL full-text indexes for text. Use foreign keys, unique source identifiers, parameterized SQL and reproducible migrations.

### Data correctness

- Preserve original catalogue titles and descriptions unchanged.
- Store English translations or summaries separately.
- Distinguish **explicit**, **inferred**, **unknown** and **contradictory** attributes.
- Distinguish an object's creation period from the auction date.
- Distinguish original makers, attributions, school/follower and “in the style of”.
- Distinguish period originals from reproductions.
- Store estimates separately from realized sale prices; never imply an estimate is the final price.
- Do not generate synthetic auction dates for production use.
- Use source content hashes and processing/model versions to reprocess only changed data.

## 6. Collection and processing

### Collection

Start with a configurable Drouot adapter, subject to source terms, rate limits and access restrictions; do not bypass anti-bot or authentication controls. Discover auctions, queue jobs, retrieve catalogue pages and lots, upsert idempotently, record completeness and errors, and resume interrupted jobs. Initially configure safeguards of **four auctions per run, three catalogue pages per auction and 300 lots per auction**, but treat these as *operational limits*, not evidence of a complete catalogue. Expand only after testing.

Track expected vs collected lots when a reliable total is available. Use bounded retries and backoff, and schedule collection only after explicit approval.

### AI normalization

Process new or changed lots with schema-validated structured outputs. Use category-specific fields:

- **Furniture:** object type, style, period, maker, origin, materials, dimensions, condition.
- **Fine art:** artist/attribution, medium, subject, school, style, period, dimensions.
- **Fashion:** brand, object type, model, colour, material, size, condition; intended wearer only when supported.
- **Jewellery/decorative arts:** relevant object, material, maker, period and category attributes.

Record supporting text and provenance per attribute. Never promote inference to fact. Normalize French/English specialist vocabulary without treating nearby concepts as exact synonyms.

### Embeddings

Build concise semantic text from the lot's reliable title, description, category, style, maker and useful synonyms. Generate embeddings only when content or model version changes. Store model identifiers and dimensions; never mix incompatible vectors in one index. Choose vector dimensions based on the selected model rather than assuming 1,536 dimensions are required.

## 7. Search design

### Query interpretation

Interpret intent (auction discovery, upcoming auctions, or lot discovery), object/category, essential requirements, preferences, exclusions, maker/brand, style, period, material, colour, subject, date and estimate limits. Use deterministic parsing and a controlled bilingual vocabulary for straightforward queries; call AI when the intent or constraints are complex or ambiguous. Never add unrequested restrictions.

**Example:** “Louis XV armchairs, preferably giltwood, estimated below €2,000” means armchair and Louis XV are required; giltwood is preferred; the price constraint applies to an explicitly defined estimate field. For initial UX, use the **high estimate** as the default ceiling, label that assumption, and allow users to change it.

### Hybrid retrieval and ranking

Combine vector similarity, PostgreSQL full-text search, structured matching, category matching, fuzzy artist/maker matching and controlled synonym expansion. Use reciprocal rank fusion as a candidate-merging baseline, then evaluate alternatives. Compare configurable candidate pools (40, 80, 100 and 200), measuring both recall and latency rather than assuming larger is better.

Apply reliable hard filters, then rank using relevance, preferences and source evidence. Classify Confirmed/Possible/Related using deterministic evidence checks wherever possible; reserve additional AI assessment for genuinely ambiguous cases. An explicit contradiction blocks Confirmed and Possible classification for that essential attribute. Return useful possible matches when confirmed matches are absent; explain limited index coverage rather than claiming no matching objects exist anywhere.

### Distinct search modes

- **Auction discovery:** Search auction records, catalogue metadata and aggregate indexed lot content; rank catalogues by relevance and completeness.
- **Lot discovery:** Search individual lots, optionally restricted to an auction, house or date window.

These modes share the database but need separate retrieval and ranking behavior.

## 8. API and React interface

Expose versioned, authenticated endpoints through the server layer, for example `/api/v1/lots/search`, `/api/v1/auctions/search`, `/api/v1/auctions/upcoming`, and `/api/v1/lots/:id`. The server invokes internal n8n operations where appropriate; **never put n8n credentials, OpenAI keys or database secrets in browser code**. Support validated requests, pagination, JSON and useful CSV export. Apply rate limits, safe timeouts, request-size limits and parameterized SQL; avoid logging authentication headers.

The initial React interface has three simple views: **Lot Search**, **Catalogue Search**, and **Upcoming Auctions**. Use a clean, light, blue-accented visual design with responsive result cards, obvious match badges, filters, accessible interactions, empty/loading/error states and detailed lot views. Keep API access, search state, cards, filters and details in focused, readable components.

**UI-first checkpoint:** build a navigable React prototype using clearly labelled mock data and approve its layout before implementing complex integration.

## 9. New n8n workflow design

Create new workflows, with new names and credentials, for these logical responsibilities:

1. `events-monitor-collection` — source discovery, catalogue collection, queue/retries and completeness.
2. `events-monitor-normalization` — category-aware AI extraction and evidence.
3. `events-monitor-embeddings` — incremental embedding creation.
4. `events-monitor-search` — query interpretation, retrieval, ranking and relevance assessment.

Query parsing and hybrid retrieval can be separate **subworkflows** if useful, but should not be split merely to increase workflow count. Keep synchronous user searches fast and asynchronous indexing separate. Use distinct database credentials, webhook routes and configuration from the reference application. Verify database identity before writes. Build and test workflow JSON files locally; use n8n MCP sparingly for validation, not automatically.

## 10. Phased build plan

| Phase | Build activity | Exit criteria |
|---|---|---|
| **1. Foundation and architecture** | Confirm greenfield scope; inspect environment and reference database schema read-only; define data model, workflow contracts, API and repository structure | Approved architecture and schema; no changes to the reference system |
| **2. UI prototype** | Create minimal React/TypeScript application in the chosen current folder; implement mock search, results and detail views | Usable responsive prototype approved before backend complexity |
| **3. Database** | Create `events-monitor_db`, migrations, extensions, indexes and test fixtures | Reproducible clean install; schema and integrity tests pass |
| **4. Collection** | Build new source adapter, queue, idempotent upserts, retries and coverage tracking | Real permitted catalogue samples collected accurately; partial failures recover |
| **5. Normalization** | Implement bilingual category-specific extraction, evidence records and change detection | Structured output validated against representative lots |
| **6. Embeddings and indexes** | Create incremental vectors, full-text indexes and metadata filtering | Retrieval works on seeded dataset; no redundant processing |
| **7. Search engine** | Implement query interpretation, two search modes, hybrid ranking and graded relevance | Labelled tests show correct classes, exclusions and explanations |
| **8. API and UI integration** | Secure server endpoints, n8n invocation, pagination, filters and CSV; connect React | Browser-to-API flow works without exposed secrets |
| **9. Quality and performance** | Regression, security, reliability, latency, recall/precision and AI-cost tests | Acceptance thresholds met and failures documented |
| **10. Deployment and operations** | Backups, recovery, logging, monitoring, schedules and user/developer documentation | Operational checklist passes; activation explicitly approved |

**Execution rule:** Implement and test one phase at a time. Each phase must produce working files, tests and concise documentation. Stop at the architecture, UI and deployment approval gates. Do not silently introduce new dependencies, activate schedules, delete data or modify the reference application.

## 11. Acceptance tests and quality metrics

Create a labelled evaluation dataset with Confirmed, Possible, Related and Non-match examples, using real catalogue data where permissible and isolated fixtures for edge cases. Include at least these searches: “Shoes”, “Men's shoes”, “Women's designer shoes”, “Chanel handbags”, “Louis XV armchair”, “Louis XVI commode”, “French antique furniture”, “18th-century portrait painting”, “Ancient coins”, “Bronze sculptures”, “19th-century landscape paintings”, and “Fashion for feet”. Add French synonyms, misspellings, exclusions, missing/contradictory attributes, dates and estimates.

Measure **Precision@K, Recall@K, confirmed-match precision, false positives/negatives, ranking usefulness, query latency, database execution time, AI calls and cost per query**. Also test partial collection, interruptions, API validation, authentication, zero results, stale indexing and database outages. Set quantitative pass/fail thresholds after measuring a baseline on the representative test dataset; the source material does not establish defensible numerical targets.

## 12. Operational safeguards

- Keep the reference application and database unchanged; never depend on the reference system at runtime.
- Use independent credentials, workflow IDs, endpoint paths and writable state.
- Back up the new database and verify restore procedures before routine operation.
- Track collection freshness, auction/lot counts, partial catalogues, job backlogs, errors, API latency and AI spend.
- Distinguish upcoming, completed and historical auctions; **do not automatically inherit a 30-day deletion policy**.
- Require explicit approval before enabling schedules, retention/deletion or production exposure.
- Respect source access rights and catalogue/image usage restrictions.

## 13. Deliverables

The completed project should contain: a working React frontend; a secure server API; the new PostgreSQL database and migrations; importable n8n workflow JSON; sample fixtures; automated tests and relevance evaluations; setup/configuration instructions; architecture and API documentation; and an operations, backup and recovery guide.

## 14. Definition of success

EventsMonitor succeeds when a buyer can search upcoming catalogues and individual lots in natural English or French, discover genuinely relevant objects even when descriptions are incomplete, understand which attributes are proven or uncertain, follow each result to its original source, and trust that collection coverage and system limitations are communicated clearly. It must do this with maintainable components, measured search quality, predictable AI costs and no dependency on the previous application.

---

### Consolidation decisions

This specification intentionally replaces the earlier document's competing instructions to **improve the reference system**, **create a parallel comparison implementation**, and **build a fresh application** with one consistent direction: **build a new product from scratch**. It preserves the useful search, data-quality and workflow recommendations, while removing migration/regression dependencies and avoiding an unnecessarily fragmented n8n design. Exact reuse of the reference SQL schema requires obtaining and inspecting its real definitions; the supplied document alone is insufficient to reproduce it exactly.
