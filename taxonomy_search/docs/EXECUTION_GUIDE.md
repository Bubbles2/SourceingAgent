# Execution guide

All commands run from the project root. They use the virtual environment in `.venv`
(Python 3.14 from Homebrew; Python ≥ 3.11 required).

## One-time setup

| Step | Command | Purpose |
|---|---|---|
| S1 | `/opt/homebrew/bin/python3.14 -m venv .venv` | Create the virtual environment |
| S2 | `.venv/bin/python -m pip install -e ".[all]"` | Install the package with pytest, the embedding libraries (sentence-transformers, torch, pgvector) and the API libraries (FastAPI, uvicorn, httpx). `".[dev]"` alone is enough for Phases 1–4 and keyword/taxonomy search. |
| S3 | `cp .env.example .env` | Optional: only needed if the defaults (localhost, `events_monitor_db`, OS user) do not fit |

## Phase 1 — inspect the source data (read-only)

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 1 | `.venv/bin/python -m auction_search.cli check-db` | Verify the connection, server version and read-only session | No |
| 2 | `.venv/bin/python -m auction_search.cli inspect-db` | Inspect `drouot_collector`; identify auction/lot tables; write structure report and source mapping | No |
| 3 | `.venv/bin/python -m auction_search.cli analyze-lots` | Profile data quality; write data-quality report and representative samples | No |

Optional ad-hoc probe (read-only SQL): `psql -h localhost -d events_monitor_db -f sql/phase1_term_probes.sql`.

`analyze-lots` re-runs the structure inspection itself, so step 2 is not a hard prerequisite —
but run it first to review the detected tables.

## Phase 2 — taxonomy schema and seed

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 4 | `.venv/bin/python -m auction_search.cli validate-taxonomy` | Validate the seed YAML offline | No |
| 5 | `.venv/bin/python -m auction_search.cli validate-taxonomy --sandbox` | Migrate + load + 28 scenarios in a transaction that is rolled back | No (rolled back) |
| 6 | `.venv/bin/alembic upgrade head --sql` | Print the migration SQL for review (also saved as `reports/migration_0001_preview.sql`) | No |
| 7 | `.venv/bin/alembic upgrade head` | **Create schema `auction_search`** — you run this | **Yes** (new schema only) |
| 8 | `.venv/bin/alembic current` | Confirm revision `0001` is applied | No |
| 9 | `.venv/bin/python -m auction_search.cli load-taxonomy --dry-run` | Load the seed and roll back; shows counts | No (rolled back) |
| 10 | `.venv/bin/python -m auction_search.cli load-taxonomy` | Load the seed as draft version `0.1.0`, rows `candidate` | **Yes** (`auction_search` only) |
| 11 | `.venv/bin/python -m auction_search.cli show-concept style.louis_xiv` | Inspect a loaded concept | No |

Steps 7 and 10 are the only ones that change the database, and only inside `auction_search`.
On this machine steps 7–10 were run on 2026-11-07: migration `0001 (head)` applied, seed loaded as
draft version `0.1.0` with all rows `candidate`.
Before step 7, `show-concept KEY --sandbox` shows any concept from a rolled-back sandbox.

## Phase 3 — build the taxonomy from lot data (rules only)

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 12 | `.venv/bin/python -m auction_search.cli extract-terms` | Extract known terms and candidate terms from all lots (cache in `.cache/extraction/`) | No |
| 13 | `.venv/bin/python -m auction_search.cli build-candidates` | Group, translate, link, score; write `reports/taxonomy_extraction.md` | No |
| 14 | `.venv/bin/python -m auction_search.cli import-candidates --dry-run` | Import and roll back; shows counts | No (rolled back) |
| 15 | `.venv/bin/python -m auction_search.cli import-candidates` | Store candidates + evidence as draft version `0.2.0` | **Yes** (`auction_search` only) |
| 16 | `.venv/bin/python -m auction_search.cli review-taxonomy export reports/review.csv --version 0.2.0` | Export candidates for human review | No |
| 17 | `.venv/bin/python -m auction_search.cli review-taxonomy apply reports/review.csv` | Record approve/reject decisions and corrected labels | **Yes** (`review_status`, labels) |
| 18 | `.venv/bin/python -m auction_search.cli publish-taxonomy 0.2.0` | Publish the reviewed version (refuses if checks fail) | **Yes** (`taxonomy_versions`) |

Steps 12–15 in one go: `build-taxonomy` (accepts all their options). On this machine steps 12–16
were run on 2026-11-07 (version `0.2.0`: 952 candidates). Review files exported for both versions:
`reports/review_0.1.0_seed.csv` and `reports/review_0.2.0_candidates.csv` (guide: TAXONOMY.md §7).
**Steps 17–18 need the human review, which is in progress (the user is reviewing the CSVs).**
Apply each file (`--dry-run` first), then publish `0.2.0` only.

An interrupted extraction continues with `extract-terms --resume`; `--limit 500` processes a sample;
`--refresh` ignores the cache.

## Phase 4 — classify the lots (rules only)

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 19 | `.venv/bin/alembic upgrade head` | Apply migrations `0002` and `0003` (classification state, search tables, embeddings) | **Yes** (new tables in `auction_search`) |
| 20 | `.venv/bin/python -m auction_search.cli classify-lots --limit 500 --dry-run` | Try the classifier on a sample, write nothing | No |
| 21 | `.venv/bin/python -m auction_search.cli classify-lots` | Classify every lot; write `reports/classification_quality.md` | **Yes** (`lot_concepts`, `lot_classification_state`) |

Without a published version, `--scope auto` uses the draft taxonomy and says so. After publishing a
version, run `classify-lots` again: the taxonomy fingerprint changes, so every lot is reclassified.

## Phase 5 — embeddings

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 22 | `.venv/bin/python -m auction_search.cli benchmark-embeddings` | Compare the candidate local models (downloads ≈ 470 MB each, once) | No |
| 23 | `.venv/bin/python -m auction_search.cli build-embeddings` | Embed every lot with `EMBEDDING_MODEL` | **Yes** (`lot_embeddings`) |

## Phases 6–8 — search, expansion, external providers

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 24 | `.venv/bin/python -m auction_search.cli build-search-index` | Build the French/English full-text documents | **Yes** (`lot_search_documents`) |
| 25 | `.venv/bin/python -m auction_search.cli search "Find Louis XIV furniture"` | Search from the command line | log row in `search_queries` |
| 26 | `.venv/bin/python -m auction_search.cli expand-query "Louis XIV furniture" --criteria` | Show the search criteria (keywords per idea, AND/OR query, phrases) for any engine or API | No |
| 27 | `.venv/bin/python -m auction_search.cli compare-search` | Hybrid vs keyword on the brief's examples → `reports/search_comparison.md` | No (not logged) |
| 28 | `.venv/bin/python -m auction_search.cli search-external "Louis XIV furniture"` | Search the mock and local providers | log rows in `external_search_log` |
| 29 | `.venv/bin/python -m auction_search.cli serve-api --port 8000` | HTTP API on `http://127.0.0.1:8000` (`/docs` for the OpenAPI page) | log rows |

Search needs steps 21 and 24; the semantic channel also needs step 23 (`--no-semantic` works
without it).

## Phases 9–10 — evaluation and maintenance

| Order | Command | Purpose | Writes to DB? |
|---|---|---|---|
| 30 | `.venv/bin/python -m auction_search.cli evaluate-search --save-baseline` | Benchmark all systems; save the baseline; write the judgement pool | No (unless `--log-queries`) |
| 31 | `.venv/bin/python -m auction_search.cli improve-taxonomy --dry-run` | Show proposals from search logs and classifications | No (rolled back) |
| 32 | `.venv/bin/python -m auction_search.cli improve-taxonomy` | Store them as candidates of draft version `0.3.0` | **Yes** (candidates only; never approved) |
| 33 | `.venv/bin/python -m auction_search.cli run-regression` | Compare with the baseline and check invariants (exit 6 on failure) | No |
| 34 | `.venv/bin/python -m auction_search.cli maintain` | Routine: index → reclassify affected lots → embed new lots → regression | **Yes** (only what changed) |

Run `maintain` after the collector has added lots, and after `review-taxonomy apply` or
`publish-taxonomy`. Proposals from step 32 go through the same review as Phase 3 (steps 16–18).
On this machine steps 19–34 were all run on 2026-11-07/08 with the draft taxonomy.

## Tests

```bash
.venv/bin/python -m pytest
```

Shorter forms: `python -m auction_search <command>` and, inside the activated venv, `auction-search <command>`.

## Options

Global (before the command): `--log-level {DEBUG,INFO,WARNING,ERROR}`, `--log-format {text,json}`.

| Command | Options |
|---|---|
| `check-db` | — |
| `inspect-db` | `--schema NAME`, `--output-dir DIR`, `--auction-table NAME`, `--lot-table NAME`, `--estimate-counts` |
| `analyze-lots` | `--schema NAME`, `--output-dir DIR`, `--auction-table NAME`, `--lot-table NAME`, `--limit N`, `--language-sample N` (0 = all), `--samples-per-category N`, `--max-categories N` |
| `validate-taxonomy` | `--seed PATH`, `--sandbox`, `--sandbox-schema NAME`, `--output-dir DIR` |
| `load-taxonomy` | `--seed PATH`, `--approve`, `--dry-run`, `--created-by NAME` |
| `show-concept` | `KEY`, `--sandbox`, `--seed PATH` |
| `extract-terms` | `--limit N`, `--batch-size N` (500), `--resume`, `--refresh`, `--cache-dir DIR` |
| `build-candidates` | `--min-lots N` (3), `--cache-dir DIR`, `--output-dir DIR` |
| `import-candidates` | `--version LABEL` (0.2.0), `--min-confidence X` (0.4), `--dry-run`, `--cache-dir DIR`, `--output-dir DIR` |
| `build-taxonomy` | all options of the three commands above |
| `review-taxonomy` | `list` / `export FILE` [`--status`, `--dimension`, `--provenance`, `--version`, `--min-confidence`, `--limit`; export also `--delimiter , \| ;`]; `apply FILE [--dry-run]`; `approve KEY… [--dry-run]`; `reject KEY… [--dry-run]` |
| `publish-taxonomy` | `VERSION`, `--dry-run` |
| `classify-lots` | `--scope {auto,draft,published}`, `--limit N`, `--batch-size N` (500), `--force`, `--resume`, `--dry-run`, `--affected`, `--output-dir DIR` |
| `benchmark-embeddings` | `--sample-size N` (1000), `--output-dir DIR` |
| `build-embeddings` | `--model NAME`, `--limit N`, `--batch-size N` (256), `--force`, `--resume`, `--dry-run`, `--output-dir DIR` |
| `build-search-index` | `--limit N`, `--batch-size N` (1000), `--force` |
| `search` | `QUERY`, `--mode {exact,broad,exploratory}` (broad), `--language {all,fr,en}`, `--scope`, `--no-semantic`, `--limit N` (10), `--json` |
| `compare-search` | `--mode`, `--language`, `--scope`, `--no-semantic`, `--output-dir DIR` |
| `serve-api` | `--host` (127.0.0.1), `--port` (8000), `--no-semantic` |
| `expand-query` | `QUERY`, `--language`, `--depth {exact,broad,exploratory}` (broad), `--criteria`, `--max-queries N` (flat list 20; criteria 40 per idea), `--scope`, `--json` |
| `search-external` | `QUERY`, `--providers a,b`, `--language`, `--depth`, `--max-queries N` (keywords per idea, 40), `--max-requests N` (6), `--limit N` (10), `--scope`, `--json` |
| `evaluate-search` | `--scope`, `--save-baseline`, `--output-dir DIR`, `--log-queries` |
| `improve-taxonomy` | `--scope`, `--version LABEL` (0.3.0), `--min-searches N` (1), `--extract`, `--dry-run`, `--cache-dir DIR`, `--output-dir DIR` |
| `run-regression` | `--scope`, `--tolerance X` (0.05), `--output-dir DIR` |
| `maintain` | `--scope`, `--tolerance X` (0.05), `--output-dir DIR` |

Commands that change the taxonomy or the classifications have `--dry-run` (`load-taxonomy`,
`import-candidates`, `build-taxonomy`, `review-taxonomy apply/approve/reject`, `publish-taxonomy`,
`classify-lots`, `build-embeddings`, `improve-taxonomy`). `build-search-index` has none: it only
rebuilds a derived copy of the source text. The batch jobs over lots (`extract-terms`,
`classify-lots`, `build-embeddings`, `build-search-index`) take `--limit` and `--batch-size`, are
incremental by content hash, and commit per batch, so an interrupted run continues where it stopped
(`--resume` is accepted and is the default behaviour).

Examples:

```bash
.venv/bin/python -m auction_search.cli analyze-lots --limit 1000 --output-dir /tmp/dq-test
```

```bash
.venv/bin/python -m auction_search.cli show-concept fashion.footwear --sandbox
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | database or connection error |
| 2 | invalid arguments, configuration, unreadable/malformed seed, unknown table or concept |
| 3 | auction/lot tables could not be identified |
| 4 | taxonomy validation failed (seed errors, failed scenario, database check error) |
| 5 | `auction_search` has not been migrated yet (run `alembic upgrade head`) |
| 6 | `run-regression` / `maintain`: a metric fell below the baseline or an invariant failed |

## Undoing the migration (destructive)

```bash
AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 .venv/bin/alembic downgrade base
```

This drops every `auction_search` table and its data (the empty schema and `alembic_version`
remain). It refuses to run without the environment variable. `alembic downgrade 0002` removes only
the embeddings table; `alembic downgrade 0001` also removes the search and classification-state tables.
