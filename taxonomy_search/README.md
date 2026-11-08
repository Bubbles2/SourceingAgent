# Auction taxonomy search

> **In the Sourcing agent:** this folder is the Sourcing agent's taxonomy search — the site search and the admin
> Search tab use it. How it is wired in, how to run it, and every file it touches outside this folder:
> [INTEGRATION.md](INTEGRATION.md).

A Python application that builds a specialist auction taxonomy (categories, object types,
periods, styles, materials, makers, techniques; French and English) from existing Drouot
auction data in PostgreSQL, and uses it for natural-language search of lots — internally
(taxonomy + full-text + semantic) and against external auction providers.

**Status: all 10 phases implemented (2026-11-08).** Built and run on the real data: the taxonomy
schema (migrations `0001`–`0003`), a draft taxonomy (seed `0.1.0`, 176 concepts; rule extraction
`0.2.0`, 952 candidates; search-feedback proposals `0.3.0`, 24 relationships), classification of
all 20,923 lots, multilingual embeddings (pgvector), hybrid search with query expansion, an HTTP
API, an external-provider framework (mock + local providers only — no real provider is
connected), an evaluation benchmark and a maintenance/regression loop.

**Important:** nothing is published yet. Search runs on the *draft* taxonomy (curated seed +
approved rows only) until a human reviews and publishes a version, and the benchmark labels are
provisional rules, not human judgements. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Database

| Setting | Value |
|---|---|
| Engine | PostgreSQL (found: 18.4, Homebrew) |
| Host / port | `localhost` / `5432` |
| Database | `events_monitor_db` |
| Source schema (existing auctions and lots) | `drouot_collector` — **read-only for this project** |
| Application schema (taxonomy, classifications, search) | `auction_search` — migrations `0001`–`0003` applied (`alembic current` → `0003`) |
| Credentials | environment variables `DB_USER` / `DB_PASSWORD` (empty = libpq defaults); never hard-coded |

Read-only programs open every session with `default_transaction_read_only=on`, so PostgreSQL
itself rejects any write. Programs that write (`alembic upgrade`, `load-taxonomy`, `import-candidates`,
`review-taxonomy apply`, `publish-taxonomy`, `classify-lots`, `build-embeddings`,
`build-search-index`, `improve-taxonomy`, search logging) write only inside `auction_search`. Full details: [docs/DATABASE.md](docs/DATABASE.md).

## Quick start

Requires Python 3.11+ (this machine: `/opt/homebrew/bin/python3.14`; the system `python3` is 3.9 and too old).

```bash
/opt/homebrew/bin/python3.14 -m venv .venv
```

```bash
.venv/bin/python -m pip install -e ".[all]"
```

```bash
cp .env.example .env
```

```bash
.venv/bin/python -m auction_search.cli check-db
```

```bash
.venv/bin/python -m pytest
```

Search (the first semantic search downloads the 470 MB embedding model once):

```bash
.venv/bin/python -m auction_search.cli search "Louis XIV furniture"
```

```bash
.venv/bin/python -m auction_search.cli expand-query "Louis XIV furniture" --depth broad
```

```bash
.venv/bin/python -m auction_search.cli serve-api --port 8000
```

On a fresh database the whole pipeline is, in order (details and options in
[docs/EXECUTION_GUIDE.md](docs/EXECUTION_GUIDE.md)):

```bash
.venv/bin/alembic upgrade head
```

```bash
.venv/bin/python -m auction_search.cli load-taxonomy
```

```bash
.venv/bin/python -m auction_search.cli build-taxonomy
```

```bash
.venv/bin/python -m auction_search.cli build-search-index
```

```bash
.venv/bin/python -m auction_search.cli classify-lots
```

```bash
.venv/bin/python -m auction_search.cli build-embeddings
```

```bash
.venv/bin/python -m auction_search.cli evaluate-search --save-baseline
```

After new lots arrive or the taxonomy changes:

```bash
.venv/bin/python -m auction_search.cli maintain
```

Reports are written to `reports/`. Every command supports `--help`.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, responsibilities and data flow |
| [DATABASE.md](docs/DATABASE.md) | Database configuration, schemas, tables and relationships |
| [PROGRAMS.md](docs/PROGRAMS.md) | Every Python program and module |
| [EXECUTION_GUIDE.md](docs/EXECUTION_GUIDE.md) | Exact commands and order of execution |
| [TAXONOMY.md](docs/TAXONOMY.md) | Taxonomy structure, generation and maintenance |
| [SEARCH.md](docs/SEARCH.md) | Search expansion, hybrid search and ranking |
| [EXTERNAL_APIS.md](docs/EXTERNAL_APIS.md) | External provider integration |
| [TESTING.md](docs/TESTING.md) | Test procedures, datasets and evaluation metrics |
| [PROGRESS.md](docs/PROGRESS.md) | Completed phases, outstanding tasks and decisions |

Reports by phase:

| Phase | Outputs |
|---|---|
| 1 | [database_structure.md](reports/database_structure.md), [data_quality.md](reports/data_quality.md), [lot_samples.md](reports/lot_samples.md) |
| 2 | [taxonomy_validation.md](reports/taxonomy_validation.md), [migration_0001_preview.sql](reports/migration_0001_preview.sql), [example_taxonomy.yaml](data/taxonomy/example_taxonomy.yaml) |
| 3 | [taxonomy_extraction.md](reports/taxonomy_extraction.md), `reports/review_0.1.0_seed.csv`, `reports/review_0.2.0_candidates.csv` |
| 4 | [classification_quality.md](reports/classification_quality.md) |
| 5 | [embedding_benchmark.md](reports/embedding_benchmark.md), [embedding_performance.md](reports/embedding_performance.md) |
| 6–7 | [search_comparison.md](reports/search_comparison.md) |
| 8 | [mock_catalogue.json](data/external/mock_catalogue.json) (fictitious test provider) |
| 9 | [search_evaluation.md](reports/search_evaluation.md), [queries.yaml](data/benchmark/queries.yaml), `data/benchmark/judgements_to_review.csv` |
| 10 | [taxonomy_improvement.md](reports/taxonomy_improvement.md), `reports/search_feedback_suggestions.csv`, [regression.md](reports/regression.md) |
