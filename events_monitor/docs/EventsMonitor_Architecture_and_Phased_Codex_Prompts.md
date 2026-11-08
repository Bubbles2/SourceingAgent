# EventsMonitor — Architecture Recommendation and Phased Codex Implementation Prompts

## Purpose

This companion document explains why the new EventsMonitor application should move most processing out of n8n into **Node.js + TypeScript**, use **Express** for authenticated APIs, **LangChain selectively** for AI, and retain **n8n for orchestration**. Read alongside `EventsMonitor_Product_and_Technical_Specification.md`.

## Architectural decision

**n8n coordinates; Node.js executes; PostgreSQL searches and stores; Express serves; React presents.** This should reduce per-item workflow overhead and make search latency independent of n8n, while allowing source-specific collection adapters to scale across Europe. Benefits are hypotheses to validate, not guaranteed speedups.

### Work allocation

| Work | Owner | Why |
|---|---|---|
| Collection schedules, alerts | n8n | Simple operational orchestration |
| Source fetching, parsing, pagination | Node.js workers | Efficient HTTP pooling and concurrency |
| Change detection, batch upserts | Node.js + PostgreSQL | Deterministic, transactional and testable |
| AI attributes and `descriptionfactsuk` | Node.js + selective LangChain/direct SDK | One structured pass per changed lot |
| Embedding generation | Node.js workers | Incremental, batchable |
| Hybrid search, filters, relevance | PostgreSQL + Node.js | Low latency; n8n not on request path |
| Authenticated API | Express | Typed contracts and server-side secrets |
| Search and admin UI | React | Responsive, modular components |

### Implementation guardrails

Build from scratch against `events_monitor_db`; preserve reference `auctions`/`lots` schema where possible. Add `lots.descriptionfactsuk TEXT` and generate it efficiently during normalization. Begin with two French/English CSV datasets, then benchmark search before finalizing the schema. Support European expansion through source adapters, multilingual text, currencies and time zones. Keep n8n schedules disabled until approval. Do not activate n8n MCP automatically; inspect local workflow JSON and use MCP sparingly for validation.

## How to use the prompts

Run **one phase at a time** in Codex. Supply the master specification and the outputs from prior phases. Each prompt requires tests, a short change summary and an explicit stop at the end; do not silently proceed to the next phase. For phases requiring approvals, wait for approval before implementation.

## Phased implementation prompts

### PHASE 0A — Profile auction and lot CSVs

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Inspect both supplied CSVs without altering them. Identify schemas, language coverage, duplicates, missing descriptions, source identifiers, date/currency formats, representative edge cases and terminology. Produce docs/00a-data-profile.md and reproducible profiling scripts. Do not create the database yet.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 0B — Vocabulary and evidence contracts

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** From the CSV samples, create bilingual auction terminology mappings, category-specific extraction schemas, provenance statuses and factual UK-English summary examples. Define how period differs from style and maker from attribution. Produce docs/00b-extraction-contract.md and validated sample fixtures.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 0C — Search benchmark

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Build labelled evaluation queries and compare lexical, semantic and hybrid search on the CSVs. Include confirmed/possible/related/irrelevant judgements, broad shoes queries, ambiguous historical descriptions and no-result cases. Report recall@K, precision@K, latency and AI cost. Avoid selecting a method without measured evidence.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 1 — Architecture and schema approval

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Design the fresh React/Express/Node workers/n8n/PostgreSQL system. Inspect the reference database read-only; propose events_monitor_db schema preserving auctions/lots wherever practical and adding lots.descriptionfactsuk. Define source adapter contracts, queue strategy, security boundaries, API contracts and migrations. Produce diagrams and a schema diff; stop for approval.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 2 — UI prototype

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** In the current folder, build a minimal React + TypeScript interface with mock auction and lot data. Include lot search, catalogue discovery, upcoming auctions, source/country filters, match explanations and descriptionfactsuk display. Keep components small and accessible. Present screenshots or runnable preview; stop for design approval.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 3 — Database and migrations

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Create events_monitor_db with approved versioned SQL migrations. Verify compatible auctions/lots definitions, source keys, evidence, embeddings, job tracking and descriptionfactsuk TEXT. Add indexes justified by query plans. Add read/write isolation tests proving no changes to reference systems. Provide rollback and seed instructions.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 4 — Express API foundation

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Implement TypeScript Express backend with validated requests, authenticated endpoints, least-privilege DB access, safe errors, health checks and typed contracts. Build search and admin endpoint stubs and integration tests. Never expose n8n, AI or database credentials to the browser.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 5 — Source adapters and efficient collection

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Implement a generic source adapter contract and the first permitted Drouot adapter. Prefer structured data/API access, bounded per-source concurrency, conditional fetches, content hashing, pagination, resumable checkpoints, retries and batch upserts. Track complete/partial/failed status. Benchmark unchanged repeat runs and prove no needless lot processing.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 6 — Background jobs and orchestration

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Implement durable jobs for collection, normalization and embedding; evaluate PostgreSQL-backed queue first. Ensure idempotency, retries, cancellation, status, failure recovery and metrics. Create lightweight n8n workflows that schedule/trigger jobs and report outcomes, not per-lot transformations. Leave schedules inactive pending approval.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 7 — AI normalization and descriptionfactsuk

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Implement schema-validated category-aware extraction in Node.js; evaluate LangChain versus direct SDK and choose the simplest effective approach. Produce descriptionfactsuk in the same model call as structured normalization, with factual evidence and UK English. Skip unchanged records via hashes, record model/prompt version, and reject stale writes. Test attribution and period/style distinctions.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 8 — Embeddings and hybrid retrieval

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Create versioned embeddings and PostgreSQL pgvector/full-text/structured/fuzzy retrieval. Compare candidate limits and rank fusion against Phase 0C benchmarks. Measure whether descriptionfactsuk helps; keep original text searchable. Use batching, incremental processing and proper indexes.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 9 — Query parsing and graded relevance

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Implement query intent/constraints, bilingual vocabulary, confirmed/possible/related classification and evidence explanations in Node.js. Use deterministic ranking first and selective LangChain/AI assessment only for ambiguity. Ensure search never invokes n8n. Test hard exclusions, missing evidence, contradictions and broad queries.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 10 — Frontend integration and European extensibility

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Connect approved React UI to Express; add source/country/language/currency/date filters, catalogue and lot modes, pagination, provenance, descriptionfactsuk and freshness indicators. Prove a second mocked source can be added through an adapter without changing search logic.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 11 — Quality, security and performance

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Run end-to-end and load tests with CSV fixtures. Measure precision/recall, latency percentiles, throughput, collection completeness, repeat-run work, token/API cost and recovery. Test SQL injection, auth failures, rate limits, secrets handling and source isolation. Fix regressions before release.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.

### PHASE 12 — Documentation and controlled activation

**Copy into Codex:**

> You are building a **new EventsMonitor application** in the current working directory. Read `EventsMonitor_Product_and_Technical_Specification.md`, applicable project instructions, and completed phase deliverables first. Do not modify any existing reference application, database or workflow. Use `events_monitor_db` only for new database writes. Keep implementation modular, secure and efficient; do not add dependencies without justification.
>
> **Task:** Document architecture, source adapter contract, schema, APIs, n8n workflows, operations, backups, restores and recovery. Provide setup scripts and acceptance report. Do not enable scheduled collection or production credentials without explicit approval.
>
> **Completion:** Supply changed file paths, commands to run, tests performed with results, assumptions and unresolved risks. Do not invent successful tests or unavailable source access. Stop after this phase and request approval where indicated.
