# Programs and modules

Phase 1 delivers three read-only programs (§1.1–1.4). Phase 2 adds three taxonomy programs and
the Alembic migration (§1.5–1.8). Phase 3 adds the rule-based taxonomy building pipeline and the
review workflow (§1.9–1.14). Phases 4–10 add migrations `0002`–`0003`, classification, embeddings,
search, expansion, the API, external providers, evaluation and maintenance (§1.15–1.28).
**No program uses AI tokens.** The only network access is the one-time download of embedding
models from Hugging Face; no external auction API is called (the `mock` provider is a local file).

Source layout:

```
src/auction_search/
├── __init__.py, __main__.py
├── cli.py                     # command-line entry point
├── config.py                  # settings from env / .env
├── logging_config.py          # structured logging
├── reporting.py               # JSON + Markdown writers
├── database/
│   ├── connection.py          # read-only and read-write engines
│   ├── inspection.py          # structure inspection + table/column role inference
│   ├── inspection_report.py   # Markdown for the structure report
│   ├── data_quality.py        # data-quality profiling
│   ├── data_quality_report.py # Markdown for data quality + samples
│   ├── models.py              # ORM models of the auction_search schema       [P2]
│   └── source.py              # batched lot reader driven by the Phase 1 mapping [P3]
├── enrichment/                                                                [P3]
│   ├── lexicons.py            # word lists used by the extraction rules
│   ├── text.py                # cleaning, tokens with spans, lemmas, roman numerals
│   ├── extraction.py          # gazetteer + pattern extractors; cached, resumable job
│   ├── classification.py      # rule-based lot classifier (assertions, review reasons)   [P4]
│   └── classification_job.py  # incremental classification job + quality report         [P4]
├── embeddings/                                                                [P5]
│   ├── generator.py           # models, Embedder, lot_text, incremental build
│   └── benchmark.py           # cross-language model benchmark
├── search/                                                                    [P6-9]
│   ├── index.py               # French/English tsvector documents
│   ├── understanding.py       # query → concept groups, intent, unresolved words
│   ├── expansion.py           # taxonomy query expansion (depths, priorities, cache)
│   ├── criteria.py            # search criteria for any engine/API: ideas, AND/OR, phrases
│   ├── hybrid.py              # taxonomy + keyword + semantic, RRF, explanations
│   └── evaluation.py          # benchmark, metrics, judgement pool
├── external/                                                                  [P8]
│   ├── base.py                # provider interface, rate limiter, retries
│   ├── mock_provider.py       # fictitious catalogue for tests
│   ├── local_provider.py      # this database behind the provider interface
│   └── orchestrator.py        # expand, query, dedupe, validate, log
├── api/main.py                # FastAPI app                                     [P6-8]
├── taxonomy/                                                                  [P2]
│   ├── vocabulary.py          # dimensions, term types, relationship types and rules
│   ├── normalization.py       # term normalisation (case, accents, ligatures)
│   ├── seed.py                # seed YAML parsing + offline validation
│   ├── store.py               # load / query the taxonomy tables
│   ├── sandbox.py             # migrations inside a rolled-back transaction
│   ├── scenarios.py           # Phase 2 validation scenarios
│   ├── report.py              # taxonomy validation report
│   ├── builder.py             # candidates: grouping, alignment, parents, confidence  [P3]
│   ├── importer.py            # candidates + evidence → auction_search                [P3]
│   ├── review.py              # list / export / apply / approve / reject / publish    [P3]
│   ├── extraction_report.py   # Phase 3 report and validation targets                 [P3]
│   ├── snapshot.py            # in-memory taxonomy, draft or published scope          [P4]
│   └── improvement.py         # proposals from search logs and co-occurrence          [P10]
└── text/
    └── language.py            # deterministic language detection
alembic.ini, migrations/       # Alembic environment + versions/0001–0003                 [P2, P4-5]
data/taxonomy/example_taxonomy.yaml   # example seed taxonomy                          [P2]
data/external/mock_catalogue.json     # fictitious lots for the mock provider          [P8]
data/benchmark/                # queries.yaml, baseline_metrics.json, judgement pool  [P9]
sql/phase1_term_probes.sql     # ad-hoc read-only probe
tests/                         # pytest suite (see TESTING.md)
```

---

## 1. Programs

### 1.1 `check-db` — connection check

| Item | Description |
|---|---|
| 1. File / location | `src/auction_search/cli.py` (`cmd_check_db`) → `database/connection.py` |
| 2. Purpose | Confirm PostgreSQL is reachable with the configured settings and that the session is read-only. |
| 3. Inputs / outputs | Inputs: `DB_*` env vars / `.env`. Output: 5 lines on stdout; logs on stderr. No files. |
| 4. Tables read | none (only `current_database()`, `current_user`, settings) |
| 5. Tables written | none |
| 6. Dependencies | SQLAlchemy, psycopg, pydantic-settings |
| 7. Command | `.venv/bin/python -m auction_search.cli check-db` |
| 8. Order / prerequisites | First command to run. Requires the venv and a running PostgreSQL. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | < 1 s |
| 11. Errors / logging | Connection failure → one `ERROR database error` log line (no password) and exit code 1. |
| 12. Example output | see below |

```
Target:            postgresql://(libpq default user)@localhost:5432/events_monitor_db schema=drouot_collector
Connected as:      dcfinlay
Database:          events_monitor_db
PostgreSQL:        18.4 (Homebrew)
Read-only session: on
```

### 1.2 `inspect-db` — database structure inspection

| Item | Description |
|---|---|
| 1. File / location | `src/auction_search/cli.py` (`cmd_inspect_db`) → `database/inspection.py`, `database/inspection_report.py` |
| 2. Purpose | Discover the real structure of the source schema: tables, columns and types, primary/unique/foreign keys, check constraints, indexes, row counts and sizes; list all schemas; check PostgreSQL version, extensions (pgvector, pg_trgm, unaccent, fuzzystrmatch), privileges and full-text configurations; **identify the auction and lot tables** and infer each column's role and language. |
| 3. Inputs / outputs | Inputs: settings; options `--schema`, `--output-dir`, `--auction-table`, `--lot-table`, `--estimate-counts`. Outputs: `reports/database_structure.md`, `reports/database_structure.json`, `reports/source_mapping.json`; summary on stdout. |
| 4. Tables read | PostgreSQL catalogues (`pg_class`, `pg_attribute`, `pg_namespace`, `pg_indexes`, `pg_extension`, `pg_available_extension_versions`, `pg_ts_config`, `pg_roles`) and `count(*)` on every table in `drouot_collector` |
| 5. Tables written | none |
| 6. Dependencies | SQLAlchemy (inspector), psycopg, pydantic |
| 7. Command | `.venv/bin/python -m auction_search.cli inspect-db` |
| 8. Order / prerequisites | After `check-db`. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 0.4 s for the current data (122 auctions, 20,923 lots). Exact `count(*)` grows linearly with table size; use `--estimate-counts` on very large tables. |
| 11. Errors / logging | One `table inspected` log line per table. Unknown schema or table override → exit 2; tables not identified → exit 3; DB error → exit 1. |
| 12. Example output | see below |

```
PostgreSQL 18.4 (Homebrew) — database events_monitor_db — user dcfinlay
pgvector: installed 0.8.7 in schema public
Schema drouot_collector: 5 relations
  auctions                    122 rows   136.0 kB
  catalogue_pages             300 rows    88.0 kB
  collection_runs              19 rows    80.0 kB
  lots                     20,923 rows    33.5 MB
  run_auctions                136 rows    64.0 kB
Auction table: auctions   Lot table: lots   FK-confirmed: True
  FK lots(source, auction_id) -> drouot_collector.auctions(source, auction_id)
  ...
Reports:
  reports/database_structure.json
  reports/database_structure.md
  reports/source_mapping.json
```

How the auction/lot tables are identified: each table is scored by name (`auctions`/`ventes`/`sales`,
`lots`), by whether it has title/description columns, and — for the lot table — by having a foreign
key to the auction table. The result is "confident" only if that foreign key exists. The evidence is
written to the report.

### 1.3 `analyze-lots` — data-quality profile

| Item | Description |
|---|---|
| 1. File / location | `src/auction_search/cli.py` (`cmd_analyze_lots`) → `database/data_quality.py`, `database/data_quality_report.py`, `text/language.py` |
| 2. Purpose | Profile the auctions and lots: null/blank/distinct counts per column; title/description length distribution; duplicate lot numbers and duplicated texts; text hygiene (description repeating the title, HTML entities, sub-lot numbering); FR/EN field coverage and the *actual* language of each field's content; category distribution and FR↔EN consistency; lots per auction, dates, auction houses, collector statuses; representative sample lots per category. |
| 3. Inputs / outputs | Inputs: settings; options `--schema`, `--output-dir`, `--auction-table`, `--lot-table`, `--limit N`, `--language-sample N`, `--samples-per-category N`, `--max-categories N`. Outputs: `reports/data_quality.{md,json}`, `reports/lot_samples.{md,json}`; summary on stdout. |
| 4. Tables read | `drouot_collector.lots`, `drouot_collector.auctions` (+ catalogues, via the structure inspection it runs first) |
| 5. Tables written | none |
| 6. Dependencies | SQLAlchemy, psycopg; `text/language.py` (no external libraries) |
| 7. Command | `.venv/bin/python -m auction_search.cli analyze-lots` |
| 8. Order / prerequisites | After `inspect-db` (it re-runs the inspection internally, so it can also run alone). |
| 9. AI tokens / external APIs | No / No — language detection is a local function-word heuristic. |
| 10. Runtime | ≈ 3.7 s wall time for all 20,923 lots (≈ 1.6 s column profiles, 0.9 s language checks over all non-empty texts). Per-step timings are recorded in the report. `--limit` bounds the work for quick tests; `--language-sample` bounds the Python-side language detection on large tables. |
| 11. Errors / logging | One `profiling step done step=… seconds=…` log line per step. Same exit codes as `inspect-db`. Every query runs under `statement_timeout` (`DB_STATEMENT_TIMEOUT_MS`). |
| 12. Example output | see below |

```
Lots analysed: 20,923   Auctions: 122   Orphan lots: 0
  lots.title: FR+EN 100.0%, FR only 0, EN only 0, neither 3
  lots.description: FR+EN 100.0%, FR only 0, EN only 0, neither 3
  lots.category: FR+EN 99.9%, FR only 0, EN only 0, neither 15
Categories: {'fr': 105, 'en': 105}   uncategorised lots: 15
  duplicates — same lot number within an auction (source, auction_id, lot_number): 216 groups / 469 rows
  ...
Samples: 120 lots
```

Samples are deterministic (ordered by `md5(lot.id)` within each category), so reruns pick the
same lots while the data is unchanged.

### 1.4 `sql/phase1_term_probes.sql` — ad-hoc probe

| Item | Description |
|---|---|
| Purpose | Rough regex counts showing whether the Phase 3 validation targets (footwear, Louis XIV, Boulle) occur in the data. Not a classifier. |
| Tables read / written | `drouot_collector.lots` / none |
| Command | `psql -h localhost -d events_monitor_db -f sql/phase1_term_probes.sql` |
| AI / external APIs | No / No |
| Runtime | < 1 s |

### 1.5 Alembic migration `0001_taxonomy_schema` — create the `auction_search` schema

| Item | Description |
|---|---|
| 1. File / location | `migrations/versions/0001_taxonomy_schema.py`, `migrations/env.py`, `alembic.ini` |
| 2. Purpose | Create schema `auction_search`: 12 tables, lookup data, 4 views (see DATABASE.md §5). |
| 3. Inputs / outputs | Inputs: `DB_*` and `APP_SCHEMA` settings. Output: the schema; with `--sql`, SQL on stdout. |
| 4. Tables read | `pg_extension` (to locate `pg_trgm`) |
| 5. Tables written | creates every `auction_search` table; inserts lookup rows; **nothing in `drouot_collector`** |
| 6. Dependencies | Alembic, SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/alembic upgrade head` (preview: `.venv/bin/alembic upgrade head --sql`) |
| 8. Order / prerequisites | Run once, after reviewing `reports/migration_0001_preview.sql`. **Applied to `events_monitor_db` on 2026-11-07.** |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | Not timed on its own. The whole sandbox run (this migration + two seed loads + 28 scenarios) takes ≈ 2 s. |
| 11. Errors / logging | One transaction: any error leaves nothing behind. Refuses source/system schemas. 10 s `lock_timeout`. Downgrade refuses without `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1`. Alembic logs each revision applied. |
| 12. Example output | `INFO  [alembic.runtime.migration] Running upgrade  -> 0001, Taxonomy schema: …` |

### 1.6 `validate-taxonomy` — validate a seed taxonomy

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_validate_taxonomy`) → `taxonomy/seed.py`, `taxonomy/sandbox.py`, `taxonomy/store.py`, `taxonomy/scenarios.py`, `taxonomy/report.py` |
| 2. Purpose | Offline: check the YAML (dimensions, FR/EN labels, duplicates after normalisation, unique preferred labels, allowed relationship triples, cycles, mapping rules). With `--sandbox`: apply migration `0001` to a temporary schema inside one transaction, load the seed twice (idempotence), run the database checks and the 28 scenarios, then **roll back**. |
| 3. Inputs / outputs | Options `--seed PATH`, `--sandbox`, `--sandbox-schema NAME`, `--output-dir DIR`. Outputs: `reports/taxonomy_validation.{md,json}`; summary on stdout. |
| 4. Tables read | `drouot_collector.lots` (two example lots, by regex) and the sandbox tables |
| 5. Tables written | only the temporary sandbox schema, inside a transaction that is always rolled back |
| 6. Dependencies | PyYAML, Alembic, SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/python -m auction_search.cli validate-taxonomy --sandbox` |
| 8. Order / prerequisites | After editing the seed; before `load-taxonomy`. Offline mode needs no database. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 0.3 s offline; ≈ 2.0 s with `--sandbox` |
| 11. Errors / logging | Exit 4 on any seed error, failed scenario or leftover sandbox schema; exit 2 for an unreadable or malformed file. |
| 12. Example output | see below |

```
Seed data/taxonomy/example_taxonomy.yaml (version 0.1.0): 176 concepts, 512 terms, 186 relationships, 105 source categories
Sandbox (auction_search_sandbox, rolled back; left behind: False): 28/28 scenarios passed, 0 database issue(s)
Result: 0 error(s), 0 failed scenario(s)
```

### 1.7 `load-taxonomy` — load a seed into `auction_search`

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_load_taxonomy`) → `taxonomy/store.py` |
| 2. Purpose | Validate, then upsert the seed into a **draft** version in `auction_search`. Idempotent. |
| 3. Inputs / outputs | Options `--seed`, `--approve` (rows approved instead of candidate), `--dry-run` (roll back), `--created-by`. Output: inserted/updated counts. |
| 4. Tables read | `auction_search.taxonomy_*` |
| 5. Tables written | `taxonomy_versions`, `taxonomy_concepts`, `taxonomy_terms`, `taxonomy_relationships`, `source_category_mappings` |
| 6. Dependencies | PyYAML, SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/python -m auction_search.cli load-taxonomy --dry-run`, then without `--dry-run` |
| 8. Order / prerequisites | **Requires `alembic upgrade head`** (exits 5 otherwise). Refuses a version that is already published. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | 987 upserts (one per concept, term, relationship and mapping) plus one preferred-label check per concept and language, in one transaction. `load-taxonomy --dry-run` against `auction_search`: ≈ 1.0 s wall time (2026-11-07). |
| 11. Errors / logging | Seed errors → exit 4, nothing written. Database check errors (cycles, missing labels) → rolled back, exit 4. |
| 12. Example output | `Version 0.1.0 (id 1) — committed` then per-table `inserted`/`updated` counts |

### 1.8 `show-concept` — inspect one concept

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_show_concept`) → `taxonomy/store.py` |
| 2. Purpose | Print a concept's terms, broader chain, narrower concepts, typed associations and Drouot category mappings. |
| 3. Inputs / outputs | Argument `KEY`; options `--sandbox` (load the seed into a rolled-back sandbox first), `--seed`. Output on stdout. |
| 4. Tables read | `auction_search.taxonomy_*` (or the sandbox) |
| 5. Tables written | none (sandbox writes are rolled back) |
| 6. Dependencies | SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/python -m auction_search.cli show-concept style.louis_xiv --sandbox` |
| 8. Order / prerequisites | Without `--sandbox`: after `alembic upgrade head` and `load-taxonomy` (exit 5 if not migrated). |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 1.1 s with `--sandbox`; well under a second otherwise |
| 11. Errors / logging | Unknown key → exit 2. |
| 12. Example output | see below |

```
style.louis_xiv  [style]  status=candidate
  Terms:
    en  preferred        Louis XIV style
    en  synonym          Louis Quatorze style
    fr  preferred        Style Louis XIV
    fr  synonym          Goût Louis XIV
  Broader (nearest first): style.french_baroque → style.baroque
  Outgoing associations:
    associated_material    material.gilt_bronze [material]
    associated_region      region.france [region]
    associated_technique   technique.boulle_marquetry [technique]
    originated_in_period   period.louis_xiv [period]
  Incoming associations:
    revival_of             style.napoleon_iii [style]
```

### 1.9 `extract-terms` — rule-based extraction from lot texts

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_extract_terms`) → `enrichment/extraction.py`, `enrichment/text.py`, `enrichment/lexicons.py`, `database/source.py` |
| 2. Purpose | Read every lot in batches and record (a) known taxonomy terms found in it, with quotes, and (b) candidate new terms found by French catalogue patterns (périodes, siècles, styles, artists, brands, attributions, object heads, materials, techniques, origins). See TAXONOMY.md §8.1. |
| 3. Inputs / outputs | Options `--limit N`, `--batch-size N` (default 500), `--resume`, `--refresh`, `--cache-dir DIR`. Output: `.cache/extraction/lots.jsonl` (one record per lot) and `state.json` (progress + statistics). |
| 4. Tables read | `drouot_collector.lots` (columns from the Phase 1 mapping); `auction_search.taxonomy_terms` / `taxonomy_concepts` for known terms (the seed file if not migrated) |
| 5. Tables written | none |
| 6. Dependencies | SQLAlchemy, psycopg; standard library only for the rules |
| 7. Command | `.venv/bin/python -m auction_search.cli extract-terms` |
| 8. Order / prerequisites | After Phase 2 (`load-taxonomy`) so known terms are recognised. |
| 9. AI tokens / external APIs | **No / No** — 0 tokens |
| 10. Runtime | ≈ 10 s for 20,923 lots (2026-11-07). Re-runs reuse cached lots whose text, extractor version and taxonomy are unchanged. |
| 11. Errors / logging | One `batch extracted` log line per batch; progress is in `state.json`. An interrupted run leaves `lots.jsonl.partial`; `--resume` continues after its last lot. Fields whose content is in another language are skipped and counted. |
| 12. Example output | see below |

```
Lots processed: 20,923 of 20,923   (extracted 20,770, cache hits 0, identical texts reused 153, resumed after lot 0)
Known terms: 512   Time: 10.0 s   AI tokens: 0
Mentions: gazetteer 49,890, material_en 16,252, object_head 9,969, technique_lexicon 8,297, …
```

### 1.10 `build-candidates` — normalise, translate and link candidates

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_build_candidates`) → `taxonomy/builder.py`, `taxonomy/extraction_report.py` |
| 2. Purpose | Group mentions, drop rare and conflicting ones, match existing concepts, find English labels by French–English alignment, propose parents, score confidence, suggest spelling variants and synonyms (TAXONOMY.md §8.2). |
| 3. Inputs / outputs | Options `--min-lots N` (default 3), `--cache-dir`, `--output-dir`. Outputs: `.cache/extraction/candidates.json`; `reports/taxonomy_extraction.{md,json}`. |
| 4. Tables read | `auction_search.taxonomy_concepts`, `taxonomy_terms`, `source_category_mappings` |
| 5. Tables written | none |
| 6. Dependencies | standard library (`difflib`, `math`) |
| 7. Command | `.venv/bin/python -m auction_search.cli build-candidates` |
| 8. Order / prerequisites | After `extract-terms`. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 2 s |
| 11. Errors / logging | Exit 2 if `lots.jsonl` is missing. Deterministic: two runs on the same input give identical output (checked). |
| 12. Example output | `Candidates: 1,760  maker 252, material 544, object_type 835, period 41, region 23, style 45, technique 20` |

### 1.11 `import-candidates` — store candidates and evidence

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_import_candidates`) → `taxonomy/importer.py` |
| 2. Purpose | Insert candidates above `--min-confidence` as `candidate` concepts, FR/EN preferred labels and relationships of a draft version, plus evidence lots/quotes for them and for attested existing concepts (TAXONOMY.md §8.3). |
| 3. Inputs / outputs | Options `--version LABEL` (default `0.2.0`), `--min-confidence X` (default 0.4), `--dry-run`, `--cache-dir`, `--output-dir`. Output: counts; refreshed `reports/taxonomy_extraction.{md,json}`. |
| 4. Tables read | `auction_search.taxonomy_*` |
| 5. Tables written | `taxonomy_versions`, `taxonomy_concepts`, `taxonomy_terms`, `taxonomy_relationships`, `taxonomy_evidence` (all in `auction_search`) |
| 6. Dependencies | SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/python -m auction_search.cli import-candidates --dry-run`, then without `--dry-run` |
| 8. Order / prerequisites | After `build-candidates`; schema migrated (exit 5 otherwise). |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | Not timed separately: ≈ 4 s is what remains of the 16.5 s `build-taxonomy` run after extraction (10 s) and building (≈ 2 s). One transaction. |
| 11. Errors / logging | Each candidate in its own savepoint: a row the database rejects is skipped and counted, not fatal. Reviewed rows are never overwritten; evidence is not duplicated on re-import. |
| 12. Example output | `concepts inserted 952 … terms 1,748, relationships 290, evidence rows 5,400` (first run); second run: `inserted 0, refreshed 952 … evidence rows 0` |

### 1.12 `build-taxonomy` — whole pipeline

Runs §1.9, §1.10 and §1.11 with the union of their options (`--dry-run` applies to the import).
Command: `.venv/bin/python -m auction_search.cli build-taxonomy`. Measured: 16.5 s on 2026-11-07.

### 1.13 `review-taxonomy` — human review

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_review_taxonomy`) → `taxonomy/review.py` |
| 2. Purpose | `list` / `export FILE.csv` candidates (filters: `--status`, `--dimension`, `--provenance`, `--version`, `--min-confidence`, `--limit`); `apply FILE.csv` reviewer decisions (approve/reject, corrected labels); `approve KEY…` / `reject KEY…`. |
| 3. Inputs / outputs | CSV columns: decision, concept_key, dimension, label_fr, label_en, broader, confidence, lots, auctions, ambiguous_lots, top_categories, english_in_data, provenance, version, status, example. Export is UTF-8 with BOM, `--delimiter , \| ;`; `apply` reads comma/semicolon, UTF-8/Windows-1252, decisions approve/reject (or yes/no, oui/non, approuvé/rejeté). |
| 4. Tables read | `auction_search.taxonomy_*` |
| 5. Tables written | `taxonomy_concepts`, `taxonomy_terms`, `taxonomy_relationships` (`review_status`, corrected labels) — not by `list`/`export` |
| 6. Dependencies | standard library `csv` |
| 7. Command | `.venv/bin/python -m auction_search.cli review-taxonomy export reports/review.csv --version 0.2.0` |
| 8. Order / prerequisites | After `import-candidates` (or `load-taxonomy`). |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | < 2 s |
| 11. Errors / logging | Unknown keys and invalid decisions are listed and give exit 2; `--dry-run` rolls back. |
| 12. Example output | `Committed: approved 12, rejected 3, labels changed 2, terms updated 26, relationships updated 9` |

### 1.14 `publish-taxonomy` — publish a reviewed version

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_publish_taxonomy`) → `taxonomy/review.py`, `taxonomy/store.py` |
| 2. Purpose | Check a draft version (approved concepts have approved FR+EN labels; approved relationships join approved concepts; no `broader` cycle), then publish it and retire the previous one. |
| 3. Inputs / outputs | Argument `VERSION`; `--dry-run` (checks only). |
| 4./5. Tables | reads `taxonomy_*`; writes `taxonomy_versions` |
| 6.–9. | SQLAlchemy; no AI, no external API |
| 7. Command | `.venv/bin/python -m auction_search.cli publish-taxonomy 0.2.0 --dry-run` |
| 10.–12. | < 1 s; exit 4 with the list of blocking problems; e.g. `Version 0.2.0: checks passed (dry run, nothing published)` |

### 1.15 Alembic migrations `0002` and `0003` — classification, search and embedding tables

| Item | Description |
|---|---|
| 1. File / location | `migrations/versions/0002_classification_and_search.py`, `migrations/versions/0003_lot_embeddings.py` |
| 2. Purpose | `0002`: `lot_classification_state`, `lot_search_documents` (tsvector + GIN), `search_queries`, `external_search_log`. `0003`: `lot_embeddings` with a pgvector `vector(384)` column and an HNSW cosine index. |
| 3. Inputs / outputs | `APP_SCHEMA`; `--sql` prints the SQL without connecting. |
| 4. Tables read | catalogue only (`0003` checks that the `vector` extension is installed and refuses otherwise) |
| 5. Tables written | creates the five tables above in `auction_search`; nothing outside it |
| 6. Dependencies | Alembic, SQLAlchemy; pgvector extension on the server for `0003` |
| 7. Command | `.venv/bin/alembic upgrade head` |
| 8. Order / prerequisites | After `0001`; before `classify-lots`. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | < 1 s each (empty tables) |
| 11. Errors / logging | Each migration runs in one transaction. Downgrades refuse without `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1`. |
| 12. Example output | `alembic current` → `0003 (head)` (applied 2026-11-07) |

### 1.16 `classify-lots` — classify every lot with the taxonomy (rules only)

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_classify_lots`) → `enrichment/classification.py`, `enrichment/classification_job.py`, `taxonomy/snapshot.py`, `database/source.py` |
| 2. Purpose | Turn each lot's Drouot category and text into assertions (`classified_as`, `dated_to`, `in_style_of`, `made_by`/`attributed_to`/…, `made_of`, `uses_technique`, `originates_from`, `mentions`) with confidence, position and evidence; flag lots for human review with reasons. TAXONOMY.md §4, ARCHITECTURE.md §7. |
| 3. Inputs / outputs | Options `--scope`, `--limit N`, `--batch-size N` (500), `--force`, `--resume`, `--dry-run`, `--affected`, `--output-dir`. Output: `reports/classification_quality.{md,json}`. |
| 4. Tables read | `drouot_collector.lots` (read-only session); `auction_search.taxonomy_*`, `source_category_mappings`, `lot_classification_state` |
| 5. Tables written | `auction_search.lot_concepts` (only rows with method `rule` / `source_category`), `lot_classification_state` |
| 6. Dependencies | SQLAlchemy, psycopg; standard library for the rules |
| 7. Command | `.venv/bin/python -m auction_search.cli classify-lots` |
| 8. Order / prerequisites | After migrations `0002` and the taxonomy load; ideally after `publish-taxonomy`. |
| 9. AI tokens / external APIs | **No / No** — 0 tokens |
| 10. Runtime | ≈ 8 s for all 20,923 lots (first run); 0.3 s when nothing changed; 3.9 s to reclassify 6,308 affected lots (2026-11-07/08) |
| 11. Errors / logging | One log line per batch; each batch committed, so an interrupted run continues on the next call. A lot is reclassified only if its content hash, the taxonomy fingerprint or the classifier version changed. |
| 12. Example output | `20,923 lots classified, 57,844 assertions, 3,220 flagged for review (15.4%)`; Louis XIV: `dated_to` lots 3672, 6928, 6933, 6934 vs `in_style_of` lots 6442, 7059, 11346, … |

### 1.17 `benchmark-embeddings` — choose the embedding model

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_benchmark_embeddings`) → `embeddings/benchmark.py`, `embeddings/generator.py` |
| 2. Purpose | Compare local multilingual models: task A (an English title must find its own French text), task B (16 English queries over French-only text, precision@10 by Drouot category); speed and storage. |
| 3. Inputs / outputs | `--sample-size N` (1000), `--output-dir`. Output: `reports/embedding_benchmark.{md,json}` with the recommended model. |
| 4. Tables read | `drouot_collector.lots` (read-only) |
| 5. Tables written | none |
| 6. Dependencies | sentence-transformers, torch, numpy (extra `embeddings`) |
| 7. Command | `.venv/bin/python -m auction_search.cli benchmark-embeddings` |
| 8. Order / prerequisites | Before `build-embeddings`; first run downloads each model from Hugging Face (≈ 470 MB each, cached in `~/.cache/huggingface`). |
| 9. AI tokens / external APIs | No tokens; one-time model download from Hugging Face |
| 10. Runtime | Not timed end to end. Measured parts: model load 12–13 s, encoding 442 (e5-small) and 575 (MiniLM) texts/s on the Mac GPU (MPS). |
| 11. Errors / logging | Exit 1 if the database is unreachable; download errors are reported by sentence-transformers. |
| 12. Example output | `Chosen: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (task B P@10 0.569 vs 0.375; task A MRR 0.746 vs 0.892) |

### 1.18 `build-embeddings` — vectors for every lot

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_build_embeddings`) → `embeddings/generator.py` |
| 2. Purpose | Embed each lot's searchable text (French title + 400 characters, English title + lead, labels of approved assertions) and store it with an HNSW index. |
| 3. Inputs / outputs | `--model NAME` (default `EMBEDDING_MODEL`), `--limit N`, `--batch-size N` (256), `--force`, `--resume`, `--dry-run`, `--output-dir`. Output: `reports/embedding_performance.{md,json}` (incl. 10 English probe queries). |
| 4. Tables read | `drouot_collector.lots` (read-only), `auction_search.lot_concepts`, `lot_embeddings` |
| 5. Tables written | `auction_search.lot_embeddings` (upsert) |
| 6. Dependencies | sentence-transformers, torch, pgvector (extra `embeddings`); `EMBEDDING_DEVICE` optional (`mps`, `cpu`, `cuda`) |
| 7. Command | `.venv/bin/python -m auction_search.cli build-embeddings` |
| 8. Order / prerequisites | After migration `0003` (and preferably `classify-lots`). |
| 9. AI tokens / external APIs | No (model runs locally) / No |
| 10. Runtime | 99 s for 20,923 lots (418 lots/s on MPS); 1.2 s when nothing changed. Table: 83.4 MB incl. 42.5 MB HNSW index. |
| 11. Errors / logging | Per-batch commit; only new or changed texts (text hash) are encoded. |
| 12. Example output | `Lots seen 20,923; embedded 0; unchanged (skipped) 20,923; whole run 1.21 s` |

### 1.19 `build-search-index` — full-text documents

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_build_search_index`) → `search/index.py` |
| 2. Purpose | Copy each lot's titles, description lead (600 characters, repeated title removed), category, auction date and lot URL into `lot_search_documents` with weighted `french`/`english` tsvectors (accents folded in Python). |
| 3. Inputs / outputs | `--limit N`, `--batch-size N` (1000), `--force`. Output: counts on stdout. |
| 4. Tables read | `drouot_collector.lots`, `drouot_collector.auctions` (read-only) |
| 5. Tables written | `auction_search.lot_search_documents` |
| 6. Dependencies | SQLAlchemy, psycopg |
| 7. Command | `.venv/bin/python -m auction_search.cli build-search-index` |
| 8. Order / prerequisites | After migration `0002`; before `search`. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | 4.6 s for all 20,923 lots (`--force`, 2026-11-08); 0.4 s when nothing changed |
| 11. Errors / logging | Incremental by content hash; per-batch commit. No `--dry-run`: it only rebuilds a derived copy. |
| 12. Example output | `Lots seen 20,923, indexed 0, unchanged 20,923, 0.39 s` |

### 1.20 `search` — natural-language search from the command line

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_search`) → `search/hybrid.py`, `search/understanding.py`, `search/expansion.py` |
| 2. Purpose | Hybrid search (taxonomy + full-text + semantic, reciprocal rank fusion) in French or English; direct matches separate from related suggestions; an explanation per hit. SEARCH.md. |
| 3. Inputs / outputs | `QUERY`, `--mode {exact,broad,exploratory}` (broad), `--language {all,fr,en}`, `--scope`, `--no-semantic`, `--limit N` (10), `--json`. Output on stdout. |
| 4. Tables read | `auction_search.lot_concepts`, `lot_search_documents`, `lot_embeddings`, `taxonomy_*` |
| 5. Tables written | `auction_search.search_queries` (one log row per search) |
| 6. Dependencies | SQLAlchemy; sentence-transformers + pgvector for the semantic channel (skipped with `--no-semantic`) |
| 7. Command | `.venv/bin/python -m auction_search.cli search "Find Louis XIV furniture"` |
| 8. Order / prerequisites | After `classify-lots`, `build-search-index` (and `build-embeddings` for semantic). |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | 14–148 ms per query (mean 34 ms over the 20 benchmark queries, broad mode); ≈ 1 s once to load the model |
| 11. Errors / logging | Warns when the draft taxonomy is used; a failed log write never fails the search. |
| 12. Example output | "commode Louis XIV" (exact) → direct lots 6928, 6933, each explained `taxonomy: period.louis_xiv dated_to; taxonomy: furniture.case_furniture.commodes classified_as` |

### 1.21 `compare-search` — hybrid vs keyword on the brief's examples

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_compare_search`) → `search/hybrid.py` |
| 2. Purpose | Run the six example queries of the brief with hybrid search and with keyword-only search (whole sentence, and content words only). |
| 3. Inputs / outputs | `--mode`, `--language`, `--scope`, `--no-semantic`, `--output-dir`. Output: `reports/search_comparison.{md,json}`. |
| 4. Tables read | as `search` |
| 5. Tables written | none (queries not logged) |
| 6. Dependencies | as `search` |
| 7. Command | `.venv/bin/python -m auction_search.cli compare-search` |
| 8. Order / prerequisites | As `search`. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 0.4 s of searching (14–148 ms per query) plus model load |
| 11. Errors / logging | Counts are not relevance; the report says so and points to Phase 9. |
| 12. Example output | "Find auctions selling shoes": keyword whole sentence 0, content words 19, hybrid direct 42 |

### 1.22 `expand-query` — taxonomy query expansion

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_expand_query`) → `search/expansion.py`, `search/understanding.py` |
| 2. Purpose | Print the structured plan of search phrases (preferred labels, translations, synonyms, variants, narrower and related concepts) with language, relationship and priority. With `--criteria`: the keywords grouped by idea, an AND/OR query per language and combined phrases, ready for any search engine or API (taxonomy only, no lots). Used by hybrid and external search. |
| 3. Inputs / outputs | `QUERY`, `--language`, `--depth {exact,broad,exploratory}` (broad), `--criteria`, `--max-queries N` (flat list: 20 phrases; criteria: 40 keywords per idea), `--scope`, `--json`. |
| 4. Tables read | `auction_search.taxonomy_*` |
| 5. Tables written | none |
| 6. Dependencies | none beyond the core |
| 7. Command | `.venv/bin/python -m auction_search.cli expand-query "Louis XIV furniture" --depth broad` |
| 8. Order / prerequisites | After the taxonomy load. |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | 0.1–0.3 ms per query (measured 2026-11-08); the taxonomy loads in 0.04 s; repeated queries come from an LRU cache |
| 11. Errors / logging | Unresolved words are listed, not dropped. Ambiguous terms are never expanded alone. |
| 12. Example output | `Mobilier Louis XIV (fr, translation, p1)`, `Meubles Louis XIV (fr, synonym, p1)`, … With `--criteria`: `AND/OR query (fr): ("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR "Meubles" OR "Lits" OR … "Commodes" … "Fauteuils" …)` |

### 1.23 `serve-api` — HTTP API

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_serve_api`) → `api/main.py` (FastAPI, served by uvicorn) |
| 2. Purpose | `GET /api/health`, `POST /api/search`, `POST /api/search/expand`, `POST /api/search/external`, `POST /api/taxonomy/reload`; OpenAPI page at `/docs`. SEARCH.md §6. |
| 3. Inputs / outputs | `--host` (127.0.0.1), `--port` (8000), `--no-semantic`. JSON requests and responses. |
| 4. Tables read | as `search`, plus `search-external` |
| 5. Tables written | `search_queries`, `external_search_log` (logs only) |
| 6. Dependencies | fastapi, uvicorn (extra `api`) |
| 7. Command | `.venv/bin/python -m auction_search.cli serve-api --port 8000` |
| 8. Order / prerequisites | As `search`. |
| 9. AI tokens / external APIs | No / only the configured providers (today: mock and local) |
| 10. Runtime | Ready in 0.3 s without the model (`--no-semantic`); "commode Louis XIV" exact search answered in 13 ms (live runs, 2026-11-08) |
| 11. Errors / logging | Invalid input → 422; unknown provider → 400; database status in `/api/health`. |
| 12. Example output | `{"database":"ok","taxonomyScope":"draft","concepts":176,"embeddingModel":null}` |

### 1.24 `search-external` — search provider adapters

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_search_external`) → `external/orchestrator.py`, `external/base.py`, `external/mock_provider.py`, `external/local_provider.py` |
| 2. Purpose | Turn the query into taxonomy search criteria and send them to each provider as AND/OR requests (or combined phrases, by its capabilities); normalise, de-duplicate, validate against the taxonomy, attribute sources. EXTERNAL_APIS.md. |
| 3. Inputs / outputs | `QUERY`, `--providers a,b` (default all: `mock`, `local_drouot`), `--language`, `--depth`, `--max-queries N` (keywords per idea, 40), `--max-requests N` (per provider and language, 6), `--limit N` (10), `--scope`, `--json`. Prints the requests sent, then the lots. |
| 4. Tables read | `auction_search.taxonomy_*`, `lot_search_documents` (local provider) |
| 5. Tables written | `auction_search.external_search_log` — **never the taxonomy** |
| 6. Dependencies | none beyond the core |
| 7. Command | `.venv/bin/python -m auction_search.cli search-external "Louis XIV furniture"` |
| 8. Order / prerequisites | After `build-search-index` (for `local_drouot`). |
| 9. AI tokens / external APIs | No tokens. **No real external provider is configured**; `mock` is a local JSON file. |
| 10. Runtime | 116 ms for "Louis XIV furniture" with both providers (16 requests); 31–178 ms for the four test queries in EXTERNAL_APIS.md (2026-11-08) |
| 11. Errors / logging | A failing request is retried (transient errors, back-off) or recorded; the other requests and providers continue. |
| 12. Example output | `Requests sent:` / `local_drouot [fr]   4 results  ("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR "Meubles" OR "Lits" OR …)` … then `[DIRECT] local_drouot:35448755 Commode dite Mazarine … d'époque Louis XIV` / `found by: Chests, Commodes, Louis XIV` |

### 1.25 `evaluate-search` — benchmark and metrics

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_evaluate_search`) → `search/evaluation.py` |
| 2. Purpose | Compare `keyword_raw`, `keyword_content`, `semantic_only`, `taxonomy_only`, `hybrid_exact`, `hybrid_broad` on 20 French/English queries: precision@10, recall@50, nDCG@10, MRR, empty results, latency; write a judgement pool for human labelling. TESTING.md "Search evaluation". |
| 3. Inputs / outputs | `--scope`, `--save-baseline`, `--output-dir`, `--log-queries`. Inputs: `data/benchmark/queries.yaml`, optional `data/benchmark/human_labels.csv`. Outputs: `reports/search_evaluation.{md,json}`, `data/benchmark/judgements_to_review.csv`, and with `--save-baseline` `data/benchmark/baseline_metrics.json`. |
| 4. Tables read | `drouot_collector.lots` (read-only), `auction_search.lot_concepts`, `lot_search_documents`, `lot_embeddings`, `taxonomy_*` |
| 5. Tables written | none. With `--log-queries`: `search_queries` (the rows are not marked as replayed, so they count as searches for `improve-taxonomy`) |
| 6. Dependencies | as `search` |
| 7. Command | `.venv/bin/python -m auction_search.cli evaluate-search --save-baseline` |
| 8. Order / prerequisites | After `classify-lots`, `build-search-index`, `build-embeddings`. |
| 9. AI tokens / external APIs | **No / No.** Labels are provisional rules plus human labels; no AI-generated label is used. |
| 10. Runtime | Not timed separately; `run-regression`, which runs the same benchmark, takes 9.7 s. |
| 11. Errors / logging | The report states the label source, the number of human labels applied (0 so far) and the taxonomy scope. |
| 12. Example output | `hybrid_broad P@10 0.795 R@50 0.828 nDCG@10 0.880 MRR 0.967 (33.8 ms) — keyword_content 0.525 0.432 0.582 0.710 (1.2 ms)` |

### 1.26 `improve-taxonomy` — proposals from searches and classifications

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_improve_taxonomy`) → `taxonomy/improvement.py` |
| 2. Purpose | Learn from the search log, the classifications and new lots: mark search demand on matching candidates, propose English labels and co-occurrence relationships, list suggestions for a human. Never approves or publishes. TAXONOMY.md §10. |
| 3. Inputs / outputs | `--scope`, `--version LABEL` (0.3.0), `--min-searches N` (1), `--extract`, `--dry-run`, `--cache-dir`, `--output-dir`. Outputs: `reports/taxonomy_improvement.{md,json}`, `reports/search_feedback_suggestions.csv`. |
| 4. Tables read | `auction_search.search_queries`, `lot_concepts`, `lot_classification_state`, `taxonomy_*`; `drouot_collector.lots` (read-only) |
| 5. Tables written | `taxonomy_versions`, `taxonomy_terms`, `taxonomy_relationships` (all `candidate` / `search_feedback`), `taxonomy_concepts.attributes` (`search_demand`); with `--extract` also the Phase 3 import tables |
| 6. Dependencies | none beyond the core |
| 7. Command | `.venv/bin/python -m auction_search.cli improve-taxonomy --dry-run`, then without `--dry-run` |
| 8. Order / prerequisites | After searches have been logged and lots classified. |
| 9. AI tokens / external APIs | No / No. External results are never used. |
| 10. Runtime | 1.0 s (dry run, 2026-11-08) |
| 11. Errors / logging | One transaction; `--dry-run` rolls back. Existing rows are not duplicated. |
| 12. Example output | `Unresolved search terms: 12; matched to candidates: 4; suggestions for a human: 10` / `Proposed: 0 translations, 24 relationships` |

### 1.27 `run-regression` — quality and invariant checks

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_run_regression`) → `search/evaluation.py` |
| 2. Purpose | Re-run the benchmark and compare hybrid metrics with the baseline; check that `dated_to`/`in_style_of` stay on periods/styles, published views hold only approved rows, no classification uses a rejected concept, and an external search leaves the taxonomy unchanged. |
| 3. Inputs / outputs | `--scope`, `--tolerance X` (0.05), `--output-dir`. Input `data/benchmark/baseline_metrics.json`. Output `reports/regression.{md,json}`. |
| 4. Tables read | as `evaluate-search` |
| 5. Tables written | none |
| 6. Dependencies | as `search` |
| 7. Command | `.venv/bin/python -m auction_search.cli run-regression` |
| 8. Order / prerequisites | After `evaluate-search --save-baseline`. |
| 9. AI tokens / external APIs | No / No (the external check uses the mock provider) |
| 10. Runtime | 9.7 s (2026-11-08) |
| 11. Errors / logging | **Exit 6** on any failed check; exit 2 when there is no baseline. |
| 12. Example output | `pass  external search does not modify the taxonomy: [1128, 2260, 500] → [1128, 2260, 500]` / `Regression check: PASS` |

### 1.28 `maintain` — routine after new lots or a taxonomy change

| Item | Description |
|---|---|
| 1. File / location | `cli.py` (`cmd_maintain`) |
| 2. Purpose | `build-search-index` → `classify-lots --affected` → `build-embeddings` → `run-regression`, each touching only what changed. |
| 3. Inputs / outputs | `--scope`, `--tolerance X` (0.05), `--output-dir`. Outputs of the four steps. |
| 4. Tables read | as the four steps |
| 5. Tables written | `lot_search_documents`, `lot_concepts`, `lot_classification_state`, `lot_embeddings` |
| 6. Dependencies | as the four steps |
| 7. Command | `.venv/bin/python -m auction_search.cli maintain` |
| 8. Order / prerequisites | After the collector adds lots, and after `review-taxonomy apply` or `publish-taxonomy`. Can be scheduled (cron/launchd). |
| 9. AI tokens / external APIs | No / No |
| 10. Runtime | ≈ 15 s on 2026-11-08 (0 lots re-indexed, 6,308 affected lots reclassified, 0 re-embedded, regression PASS) |
| 11. Errors / logging | Stops at the first failing step and returns its exit code (6 for a regression). |
| 12. Example output | the four steps' summaries, ending `Regression check: PASS` |

---

## 2. Modules

| Module | Purpose | Notes |
|---|---|---|
| `cli.py` | `argparse` entry point; one sub-command per program; maps exceptions to exit codes. | `--help` on every command. Heavy modules are imported lazily per command. |
| `__main__.py` | Allows `python -m auction_search <command>`. | |
| `config.py` | `Settings` (pydantic-settings) from env vars and `.env`; builds the SQLAlchemy URL; validates schema names as plain identifiers. | Empty `DB_USER`/`DB_PASSWORD` → libpq defaults. Password is a `SecretStr`, never printed. |
| `logging_config.py` | Structured logging to stderr: `text` (`key=value`) or `json` (one object per line). | Context is passed with `extra={...}`. |
| `reporting.py` | Writes `<name>.json` / `<name>.md`; Markdown table, truncation, size and percentage helpers. | JSON handles dataclasses, dates, decimals. |
| `database/connection.py` | `create_readonly_engine` (sessions start with `default_transaction_read_only=on` and a statement timeout); `create_readwrite_engine` (statement timeout + 10 s `lock_timeout`, used only for `auction_search`); `check_connection`. | `application_name=auction_search` makes sessions visible in `pg_stat_activity`. |
| `database/models.py` | SQLAlchemy ORM models of every `auction_search` table, with the same constraint names as migration `0001`. | Never used to create tables; a test proves they match the migrated schema. |
| `taxonomy/vocabulary.py` | Dimensions, term types, relationship types, allowed relationship triples, lot assertions. | Single source of truth; a test proves migration `0001` holds identical values. |
| `taxonomy/normalization.py` | `normalize_term` — case-fold, strip accents, expand ligatures (œ, æ, ß), punctuation → space. | Stored in `taxonomy_terms.normalized`. |
| `taxonomy/seed.py` | Parse seed YAML (`SeedFormatError` on structure problems); `validate_seed` (errors, warnings, notes); `seed_statistics`; `find_broader_cycles`. | No database needed. |
| `taxonomy/store.py` | `TaxonomyStore`: idempotent `load_seed` (upserts), versions, `find_terms`, `narrower`, `ancestors`, `relationships_between`, `describe`, `statistics`, `validate`. | Works on `auction_search` or any sandbox schema (`schema_translate_map`). |
| `taxonomy/sandbox.py` | `migrated_sandbox(engine, schema)` — runs Alembic inside one transaction and always rolls back. | Refuses an existing schema name. |
| `taxonomy/scenarios.py` | 28 validation scenarios (labels, hierarchy, associations, real lots, constraint rejections, versions). | Each scenario in its own savepoint. |
| `taxonomy/report.py` | Taxonomy validation report (Markdown + JSON). | |
| `migrations/env.py` | Alembic environment: URL from settings, all objects (incl. `alembic_version`) in `APP_SCHEMA`, refuses source/system schemas, supports an external connection for sandboxes. | |
| `migrations/versions/0001_taxonomy_schema.py` | Creates the taxonomy schema, lookup data and views. Downgrade guarded by `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1`. | Creates the trigram index only if `pg_trgm` is installed. |
| `database/inspection.py` | Catalogue queries; `classify_column` (role + language from name/type); `detect_table_roles`; `build_source_mapping`; `build_structure_report`. | Pure inference functions are unit-tested without a database. |
| `database/inspection_report.py` | Renders the structure report as Markdown. | |
| `database/data_quality.py` | `LotProfiler` (one method per profiling step) and `build_data_quality_report`. | All SQL is generated from the source mapping; identifiers are quoted. |
| `database/data_quality_report.py` | Renders the data-quality report and the samples as Markdown. | |
| `text/language.py` | `detect_language(text)` → `fr`/`en`/`de`/`it`/`es`/`nl`/`unknown` by function-word counts. | Deterministic; returns `unknown` for short or name-only texts. |
| `database/source.py` | `LotSource`: one SELECT built from the Phase 1 column roles; keyset-paginated batches of `SourceLot` (language-keyed titles, descriptions, categories, business key, auction key, content hash). | [P3] Reused by Phase 4. |
| `enrichment/lexicons.py` | Quantifiers, stop words, non-object heads, non-materials, material modifiers, technique and origin lexicons, attribution phrases → assertions. | [P3] Editable rules, not taxonomy. |
| `enrichment/text.py` | `clean`, `strip_title_prefix`, `tokens` (normalised tokens with character spans), `lemma`, roman numerals, `display_name`. | [P3] |
| `enrichment/extraction.py` | `Gazetteer` (known terms, longest match, plural tolerant), pattern extractors, `extract_lot`, `run_extraction` (batches, content-hash cache, identical-text reuse, `--resume`), `EXTRACTOR_VERSION`, rule `PRIORS`. | [P3] Bump `EXTRACTOR_VERSION` when rules change: it invalidates the cache. |
| `taxonomy/builder.py` | `build_candidates`, `Aligner` (French→English by Dice over lots), `ExistingTaxonomy`, `BuildResult` (save/load JSON). | [P3] Deterministic. |
| `taxonomy/importer.py` | `CandidateImporter.run` — candidates, labels, relationships, evidence; savepoint per candidate; idempotent. | [P3] |
| `taxonomy/review.py` | `Reviewer.list`, `export_csv`, `apply_csv`, `set_status`, `publication_issues`, `publish`. | [P3] |
| `taxonomy/extraction_report.py` | `validation_targets` (footwear, Louis XIV), `render_extraction_markdown`. | [P3] |
| `taxonomy/snapshot.py` | `TaxonomySnapshot.load(conn, schema, scope)`: concepts, terms, gazetteer, hierarchy (`descendants`, `ancestors`, `top_category`), associations, category map, fingerprint. | [P4] Draft scope excludes unreviewed machine-made rows (TAXONOMY.md §7.1). |
| `enrichment/classification.py` | `Classifier.classify(lot)` → assertions with confidence, position and evidence; context cues; review reasons; `CLASSIFIER_VERSION`. | [P4] Bump the version when rules change: it triggers reclassification. |
| `enrichment/classification_job.py` | `run_classification` (incremental, per-batch commit, `--affected`), `quality_figures`, report. | [P4] Deletes only its own rows (method `rule` / `source_category`). |
| `embeddings/generator.py` | `MODELS`, `Embedder` (MPS/CPU), `lot_text`, `text_hash`, `run_embeddings`. | [P5] |
| `embeddings/benchmark.py` | Tasks A and B, `choose`, report. | [P5] |
| `search/index.py` | `build_search_index`, `fold` (accent folding). | [P6] |
| `search/understanding.py` | `QueryInterpreter.understand` → `Understanding` (groups, unresolved words, intent, language). | [P6] |
| `search/expansion.py` | `QueryExpander.expand` → `ExpansionPlan` (each phrase tagged with its idea); `core_name`; LRU cache keyed by taxonomy fingerprint. | [P7] |
| `search/criteria.py` | `criteria_for` / `build_criteria` → `SearchCriteria` (ideas with FR/EN keywords, `boolean`, `phrases`); `render_boolean`, `parse_boolean`, `split_cnf`. | Taxonomy only; used by external search and `expand-query --criteria`. |
| `search/hybrid.py` | `HybridSearch.search`, `keyword_baseline`, `content_words`; query logging. | [P6] Tuning constants at the top of the file. |
| `search/evaluation.py` | `load_queries`, `rule_matches`, `relevant_sets`, `metrics`, `run_system`, `evaluate`, judgement pool, report. | [P9] |
| `external/base.py` | `AuctionProvider` (`build_requests`), `ProviderCapabilities` (`supports_and`, `supports_or`), `ProviderRequest`, `ExternalLot`, `ProviderPage`, `RateLimiter`, `with_retries`, errors. | [P8] |
| `external/mock_provider.py`, `local_provider.py` | The two providers available today. | [P8] |
| `external/orchestrator.py` | `ExternalSearchOrchestrator.search`, `default_orchestrator`. | [P8] No taxonomy write path. |
| `api/main.py` | `create_app(settings, semantic, log_queries)`; request models; endpoints. | [P6-8] |
| `taxonomy/improvement.py` | `TaxonomyImprover` (unresolved terms, search demand, translations, co-occurrence, review reasons, `write_proposals`), `affected_lots`. | [P10] Writes candidates only. |
| `migrations/versions/0002_…`, `0003_…` | Classification/search tables; embeddings table with HNSW index. | `0003` refuses to run without pgvector. |
