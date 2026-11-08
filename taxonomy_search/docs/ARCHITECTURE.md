# Architecture

## 1. Database configuration

| Setting | Value |
|---|---|
| Engine | PostgreSQL 18.4 on `localhost:5432` |
| Database | `events_monitor_db` |
| Source schema | `drouot_collector` (existing auctions and lots — read-only) |
| Application schema | `auction_search` (migrations `0001`–`0003`, applied 2026-11-07) |
| Credentials | `DB_USER` / `DB_PASSWORD` environment variables (empty = libpq defaults) |

Details in [DATABASE.md](DATABASE.md).

## 2. Principles

1. **Source data is never modified.** `drouot_collector` is read through read-only sessions.
   Everything this project produces lives in `auction_search` and refers back to source rows by
   their real primary key (`lots.id`) plus their business key (`source`, `lot_id`).
2. **Discover, don't assume.** Table and column names come from catalogue inspection
   (`source_mapping.json`), not from constants.
3. **Deterministic first, AI selectively.** Rule-based extraction and classification run first;
   AI is used only for ambiguous cases, cached by content hash, and never required for the basic
   taxonomy or search features.
4. **Incremental and resumable.** Every batch job supports `--limit`, `--batch-size`, `--resume`
   and change detection by content hash (from Phase 3).
5. **Python only.** CLI (`argparse`) and a FastAPI service (`serve-api`).
6. **Nothing reaches search unreviewed.** Search, classification and external validation read a
   `TaxonomySnapshot`: the published version, or — until one exists — the *draft* (curated seed
   rows plus approved rows; unreviewed machine-extracted candidates are excluded). Every output
   states which scope it used.

## 3. Components

```
                         ┌────────────────────────────────────────────┐
                         │ PostgreSQL  events_monitor_db              │
                         │  drouot_collector (source, read-only)      │
                         │  auction_search   (ours, Phase 2+)         │
                         └───────────▲───────────────────▲────────────┘
                                     │ read-only          │ read/write (Phase 2+)
┌────────────────────────────────────┴───────────────────┴────────────────────────────┐
│ auction_search (Python package, src/auction_search)                                   │
│                                                                                       │
│  config.py ── settings from env/.env      logging_config.py ── structured logs        │
│  database/connection.py ── read-only and read-write engine factories                  │
│  database/inspection.py ── catalogue inspection, table/column role inference  [P1]    │
│  database/data_quality.py ── profiling of auctions and lots                    [P1]    │
│  database/models.py ── ORM models of the auction_search schema                [P2]    │
│  database/source.py ── batched lot reader from the Phase 1 mapping            [P3]    │
│  text/language.py ── deterministic FR/EN/DE/... detection                      [P1]    │
│  reporting.py ── JSON + Markdown report writers                                [P1]    │
│  taxonomy/ ── vocabulary, normalisation, seed, store, sandbox, scenarios      [P2]    │
│  taxonomy/ ── builder, importer, review/publish, extraction report            [P3]    │
│  migrations/ (Alembic) ── versioned DDL for auction_search                     [P2]    │
│  enrichment/ ── lexicons, text, rule-based extraction                          [P3]    │
│  enrichment/classification.py, classification_job.py ── lot classification     [P4]    │
│  taxonomy/snapshot.py ── in-memory taxonomy (draft or published scope)         [P4]    │
│  embeddings/ ── model benchmark, multilingual vectors in pgvector              [P5]    │
│  search/index.py ── French/English tsvector documents                          [P6]    │
│  search/understanding.py, hybrid.py ── query understanding, hybrid ranking     [P6]    │
│  search/expansion.py ── taxonomy query expansion                               [P7]    │
│  search/criteria.py ── search criteria for any engine/API (AND/OR, phrases)     [P7-8]  │
│  external/ ── provider interface, mock + local providers, orchestrator         [P8]    │
│  api/main.py ── FastAPI endpoints                                              [P6-8]  │
│  search/evaluation.py ── benchmark, metrics, judgement pool                    [P9]    │
│  taxonomy/improvement.py ── proposals from search logs and co-occurrence       [P10]   │
│  cli.py ── one command per program                                                    │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                           reports/  (Markdown + JSON)
```

`[Pn]` = implemented in phase n. All ten phases are implemented.

## 4. Phase 1 data flow

```
check-db      → connection.check_connection → stdout
inspect-db    → inspection.build_structure_report
                  ├─ inspect_server   (version, extensions, privileges, FTS configs)
                  ├─ list_schemas     (all schemas)
                  ├─ inspect_schema   (tables, columns, PK/FK/unique/check, indexes, counts)
                  ├─ detect_table_roles → which table is "auctions", which is "lots"
                  └─ build_source_mapping → column roles (title/description/category… by language)
               → reports/database_structure.{md,json}, reports/source_mapping.json
analyze-lots  → inspect (as above) → data_quality.build_data_quality_report (LotProfiler)
               → reports/data_quality.{md,json}, reports/lot_samples.{md,json}
```

`source_mapping.json` is the contract between Phase 1 and later phases: it states which columns
hold titles, descriptions, categories, URLs and dates, per language.

## 5. Phase 2 data flow

```
data/taxonomy/example_taxonomy.yaml
        │ seed.parse_seed / validate_seed  (offline: dimensions, labels, rules, cycles)
        ▼
validate-taxonomy --sandbox
        │ sandbox.migrated_sandbox ── Alembic 0001 in temp schema, inside ONE transaction
        │ store.load_seed (twice: idempotence) ── store.validate
        │ scenarios.ScenarioRunner (28 checks; reads 2 real lots from drouot_collector)
        └─ ROLLBACK → reports/taxonomy_validation.{md,json}

alembic upgrade head            (run by the user)  → schema auction_search
load-taxonomy [--dry-run]       → auction_search.taxonomy_* (draft version, rows 'candidate')
show-concept KEY                → stdout
```

The vocabulary (`taxonomy/vocabulary.py`) is the single source of the rules; migration `0001`
copies it into lookup tables and composite foreign keys enforce it in PostgreSQL. Tests check that
the two copies, and the ORM models, stay identical to the migrated schema.

## 6. Phase 3 data flow (rules only, no AI)

```
drouot_collector.lots ── LotSource (batches of 500, keyset on lots.id) ──┐
auction_search terms ── Gazetteer (known terms) ─────────────────────────┤
                                                                          ▼
extract-terms     extract_lot: language gate → gazetteer + French patterns + English tokens
                  cache: .cache/extraction/lots.jsonl (content hash + extractor version + taxonomy fingerprint)
                  --resume continues lots.jsonl.partial
                                                                          ▼
build-candidates  group → threshold → match existing → align FR→EN (Dice) → parents → confidence
                  → .cache/extraction/candidates.json, reports/taxonomy_extraction.{md,json}
                                                                          ▼
import-candidates → auction_search: draft version 0.2.0, rows 'candidate'/'rule_extraction',
                    taxonomy_evidence (source lot, field, quote, extractor)
                                                                          ▼
review-taxonomy export → reviewer decisions in CSV → review-taxonomy apply → publish-taxonomy
                                                                          ▼
                                              published_* views (what search will read)
```

## 7. Phase 4 data flow — classification (rules only)

```
drouot_collector.lots ── LotSource (batches) ──┐
TaxonomySnapshot (draft or published) ─────────┤
                                               ▼
classify-lots   Classifier.classify(lot):
                  Drouot category → source_category_mappings (confidence 0.95)
                  title (0.9) / first sentences (0.8) → assertions; long notes → `mentions` (0.4)
                  context cues: "d'époque" → dated_to, "style/goût" → in_style_of,
                  "attribué à / atelier de / entourage de / d'après" → maker assertions,
                  complements ("cadre à bijoux"), packaging, plating → not the lot's object/material
                  ambiguous terms alone → nothing; review reasons recorded
                incremental: (content hash, taxonomy fingerprint, classifier version) per lot
                → auction_search.lot_concepts (method rule / source_category)
                → auction_search.lot_classification_state (needs_review, reasons)
                → reports/classification_quality.{md,json}
```

## 8. Phases 5–7 data flow — indexes and search

```
drouot_collector.lots ─► build-search-index ─► lot_search_documents (tsv_fr, tsv_en, date, URL)
                     └─► build-embeddings  ─► lot_embeddings (384-d, HNSW cosine)
                               ▲ model chosen by benchmark-embeddings (local, 0 tokens)

query ─► QueryInterpreter (concept groups, intent, unresolved words)
      ─► QueryExpander (FR/EN terms by depth and priority; cached)
      ─► HybridSearch: taxonomy channel (lot_concepts) + keyword channel (tsvectors)
                       + semantic channel (lot_embeddings) ─► reciprocal rank fusion
      ─► direct / related hits with explanations ─► CLI, POST /api/search
      ─► search_queries (log)
```

## 9. Phase 8 data flow — external providers

```
query ─► QueryExpander ─► criteria (ideas × FR/EN keywords) ─► per provider: build_requests
         ("Louis XIV" OR …) AND ("Mobilier" OR "Commodes" OR …), or combined phrases
      ─► AuctionProvider.search (rate limit, retries, pages) ─► ExternalLot (normalised)
      ─► de-duplicate ─► validate with the taxonomy on the lot's own text ─► direct / related
      ─► external_search_log;  never written to the taxonomy
providers today: mock (fictitious catalogue), local_drouot (this database) — no real provider
```

## 10. Phases 9–10 — evaluation and the improvement loop

```
data/benchmark/queries.yaml (+ human_labels.csv) ─► evaluate-search ─► search_evaluation.md,
     baseline_metrics.json (--save-baseline), judgements_to_review.csv (for human labelling)

search_queries + lot_concepts + lots ─► improve-taxonomy ─► draft version 0.3.0 (candidates only):
     search demand on matching candidates, translations, co-occurrence relationships,
     suggestions CSV for humans
human review ─► review-taxonomy apply ─► publish-taxonomy
maintain = build-search-index ─► classify-lots --affected ─► build-embeddings ─► run-regression
     (each step touches only what changed; run-regression exits 6 on a drop in quality or a broken invariant)
```
