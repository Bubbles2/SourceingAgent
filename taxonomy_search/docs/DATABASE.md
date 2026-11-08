# Database

## 1. Configuration

| Setting | Env var | Default | Notes |
|---|---|---|---|
| Host | `DB_HOST` | `localhost` | |
| Port | `DB_PORT` | `5432` | |
| Database | `DB_NAME` | `events_monitor_db` | |
| Source schema | `DB_SCHEMA` | `drouot_collector` | existing auctions and lots; read-only for this project |
| User | `DB_USER` | *(empty)* | empty → libpq default (OS user, `PGUSER`) |
| Password | `DB_PASSWORD` | *(empty)* | empty → libpq default (`~/.pgpass`, `PGPASSWORD`, or trust auth) |
| Statement timeout | `DB_STATEMENT_TIMEOUT_MS` | `120000` | applied to every session |
| Application schema | `APP_SCHEMA` | `auction_search` | created by migrations `0001`–`0003` when you run `alembic upgrade head` |

Settings are read from the environment and an optional `.env` file (git-ignored; template in
`.env.example`). Credentials are never hard-coded or written to logs and reports — the target is
always shown as `postgresql://user@host:port/db` without a password.

On this machine the connection works with no `DB_USER`/`DB_PASSWORD`: libpq connects as the OS
user `dcfinlay` (a superuser on this local Homebrew server) without a password.

## 2. Protection rules (all phases)

- `drouot_collector` is a **source**. This project never inserts, updates, deletes, alters or
  drops anything in it, and never rewrites titles, descriptions or other original fields.
- Phase 1 sessions are opened with `default_transaction_read_only=on`; PostgreSQL rejects writes.
  Every read of `drouot_collector` (inspection, extraction, classification, indexing, embedding,
  evaluation) uses such sessions; writes go through a separate engine and only into `auction_search`.
- New tables go into a separate schema, `auction_search`, through versioned Alembic migrations.
  Migrations are **never run automatically** — you run `alembic upgrade head` yourself.
- `migrations/env.py` refuses to run if `APP_SCHEMA` is the source schema, any `drouot_collector*`
  schema, `public` or a system schema.
- Downgrades are destructive and refuse to run unless `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1` is set.
- No foreign key points from `auction_search` into `drouot_collector` (approved decision): lots are
  referenced by `lots.id` plus `(source, lot_id)`, so the collector can keep managing its rows.
- Extensions are never assumed: the trigram index is created only if `pg_trgm` is installed, in
  whatever schema it is installed in.

## 3. What exists in `events_monitor_db` (inspected 2026-11-07)

| Schema | Tables | Size | Content | Used by this project |
|---|---|---|---|---|
| `drouot_collector` | 5 | 33.9 MB | Drouot auctions and lots (122 auctions, 20,923 lots), bilingual FR/EN | **Yes — the source** |
| `drouot_collector_py` | 5 | 9.4 MB | Same table layout, from a second (Python) collector: 20 auctions, 6,696 lots; 1,466 of those lots also exist in `drouot_collector` | No (see open question in PROGRESS.md) |
| `public` | 12 + 2 views | 1.5 MB | Another application's schema (`lots`, `auctions`, `lot_embeddings vector(1536)`, `lot_attributes`, …). All its lot/auction/embedding tables are **empty**. | No — must not be touched |

The source data is live: a collector is still adding lots (`updated_at` from 2026-11-01 to
2026-11-07 02:56 at inspection time). Counts below will grow.

### 3.1 Tables in `drouot_collector`

| Table | Rows | Role | Primary key | Business key (unique) |
|---|---|---|---|---|
| `auctions` | 122 | **auction table** | `id` bigint identity | `(source, auction_id)` |
| `lots` | 20,923 | **lot table** | `id` bigint identity | `(source, lot_id)` |
| `collection_runs` | 19 | collector bookkeeping | `id` | — |
| `run_auctions` | 136 | collector bookkeeping | `(run_id, auction_id)` | — |
| `catalogue_pages` | 300 | collector bookkeeping | `(run_id, auction_id, page_number)` | — |

### 3.2 Relationships

```
collection_runs (id) ◄── lots.last_collected_run_id
                     ◄── run_auctions.run_id
                     ◄── catalogue_pages.run_id
auctions (source, auction_id) ◄── lots (source, auction_id)
                              ◄── run_auctions (source, auction_id)
```

Lots reference auctions through the **text business key** `(source, auction_id)`, not through
`auctions.id`. `source` is always `'drouot'`. There are no orphan lots.

### 3.3 Columns used by the project

`lots`:

| Column | Type | Meaning | Nulls |
|---|---|---|---|
| `id` | bigint, PK | internal row id — **the key to reference from `auction_search`** | 0 |
| `source`, `lot_id` | text | stable business key (Drouot lot id) | 0 |
| `source`, `auction_id` | text | FK to `auctions` | 0 |
| `lot_number` | text | catalogue number — *not unique within an auction* (sub-lots share it) | 9 |
| `title_fr`, `title_en` | text | lot title | 3 each |
| `description_fr`, `description_en` | text | full description; ~90% begin with the full title | 3 each |
| `category_fr`, `category_en` | text | Drouot category, 105 values, 1:1 FR↔EN | 15 each |
| `currency` | text | EUR 17,392 · GBP 2,519 · CHF 651 · SEK 359 | 2 |
| `image_url`, `lot_url_fr`, `lot_url_en` | text | image and source URLs | 2 / 0 / 0 |
| `details_status`, `last_error` | text | collector status (`completed` 20,920 · `failed` 2 · `partial` 1) | |
| `updated_at` | timestamptz | last collector write — usable for incremental processing | 0 |

No estimate, price or result columns exist in `lots`.

`auctions`:

| Column | Type | Meaning | Nulls |
|---|---|---|---|
| `id` | bigint, PK | internal id | 0 |
| `source`, `auction_id` | text | business key | 0 |
| `title_fr`, `title_en` | text | sale title | 26 |
| `description_fr`, `description_en` | text | boilerplate ("Discover the catalog and results of the … sale") in mixed languages — **not useful for search** | 0 |
| `starts_at`, `auction_date` | timestamptz, date | 2026-11-01 → 2026-11-07 | 26 |
| `auction_house` | text | 85 distinct houses | 26 |
| `auction_url_fr`, `auction_url_en` | text | source URLs | 0 |
| `details_status`, `catalogue_status`, `last_error` | text | 30 auctions `catalogue_status = partial` | |

The 26 auctions with null title/date/house are the same 26 that have **no lots**
(`catalogue_status = partial`, "One or more pages or lot fields were incomplete").

### 3.4 Indexes on the source tables

`auctions`: PK `(id)`, unique `(source, auction_id)`.
`lots`: PK `(id)`, unique `(source, lot_id)`, btree `(source, auction_id, id)`.
There are no full-text, trigram or vector indexes on the source tables. Phase 6 will create the
indexes it needs on `auction_search` tables, not on `drouot_collector`.

## 4. Server capabilities

| Item | Status |
|---|---|
| PostgreSQL | 18.4 (Homebrew, aarch64) |
| `vector` (pgvector) | **installed**, 0.8.7, in schema `public` (not a trusted extension) |
| `pg_trgm` | installed, 1.6, in `public` |
| `unaccent` | available (1.1), not installed, trusted |
| `fuzzystrmatch` | available (1.2), not installed, trusted |
| Text-search configs | `french`, `english`, `german`, `simple`, … available |
| Connected user | `dcfinlay`, superuser, has `CREATE` on the database |
| Schema `auction_search` | created by migration `0001` on 2026-11-07 (see §5) |

Because pgvector lives in `public`, the vector type will be referenced as `public.vector` (or
with `public` on the search path) from `auction_search` tables.

## 5. `auction_search` schema (migrations `0001`–`0003`)

**State: applied to `events_monitor_db` on 2026-11-07** (`alembic upgrade head`, at the user's
request; `alembic current` → `0001 (head)`). Verified afterwards: 13 tables (incl.
`alembic_version`) and 4 views in `auction_search`; lookup rows 9 dimensions / 5 term types /
10 relationship types / 144 relationship rules / 23 assertion rules; trigram index present; no
foreign key leaves the schema; `drouot_collector` still 5 tables, 20,923 lots, 122 auctions.
The example taxonomy was then loaded at the user's request (`load-taxonomy`, default
`candidate` status): version `0.1.0` (id 2, **draft**), 176 concepts, 512 terms, 186
relationships, 113 source-category mappings — all `review_status = candidate`.
(Version id 2, not 1: the earlier dry run consumed id 1, and identity values are not rolled back.)

Phase 3 (`build-taxonomy`, 2026-11-07) added draft version **`0.2.0`**: 952 concepts, 1,748 terms,
290 relationships, all `candidate` / `provenance = rule_extraction`, and **5,400 evidence rows** in
`taxonomy_evidence` (4,174 distinct lots, 1,115 concepts — new candidates and attested seed
concepts). No table structure changed (no new migration). The `published_*` views are still empty
(nothing approved or published).

Phases 4–10 (2026-11-07/08): migrations **`0002`** (classification state, search documents, search
and external logs) and **`0003`** (embeddings) were applied with `alembic upgrade head`;
`alembic current` → `0003 (head)`. Phase 10 added draft version **`0.3.0`** (24 relationship
proposals, `candidate` / `search_feedback`) and recorded `attributes.search_demand` on 4 existing
candidate concepts.

| Version | Status | Concepts | Terms | Relationships | Provenance | Review status |
|---|---|---|---|---|---|---|
| `0.1.0` | draft | 176 | 512 | 186 | seed | candidate |
| `0.2.0` | draft | 952 | 1,748 | 290 | rule_extraction | candidate |
| `0.3.0` | draft | 0 | 0 | 24 | search_feedback | candidate |

Contents on 2026-11-08 (`drouot_collector.lots`: 20,923 rows, unchanged):

| Table | Rows | Size incl. indexes |
|---|---|---|
| `lot_search_documents` | 20,923 | 84 MB |
| `lot_embeddings` | 20,923 | 83 MB |
| `lot_concepts` | 57,844 | 42 MB |
| `lot_classification_state` | 20,923 (3,220 `needs_review`) | 12 MB |
| `taxonomy_evidence` | 5,400 | 2.4 MB |
| `taxonomy_terms` / `taxonomy_concepts` / `taxonomy_relationships` | 2,260 / 1,128 / 500 | 4.4 MB |
| `search_queries` | 22 (20 replayed benchmark queries, 2 manual test searches — no real users yet) | < 0.1 MB |
| `external_search_log` | 84 (test runs: mock and local providers) | < 0.1 MB |

The full SQL is in [reports/migration_0001_preview.sql](../reports/migration_0001_preview.sql)
(generated with `alembic upgrade head --sql`, no connection made). The design is explained in
[TAXONOMY.md](TAXONOMY.md).

### 5.1 Tables

| Table | Purpose | Key columns | Main constraints |
|---|---|---|---|
| `taxonomy_dimensions` | Lookup: the 9 dimensions | `code` | PK |
| `taxonomy_term_types` | Lookup: preferred, synonym, spelling_variant, abbreviation, hidden | `code` | PK |
| `taxonomy_relationship_types` | Lookup: 10 relationship types with hierarchy/symmetry flags and expansion weights | `code` | PK |
| `taxonomy_relationship_rules` | Allowed (type, source dimension, target dimension) triples (144 rows) | all three | PK; FKs to types and dimensions |
| `lot_assertion_rules` | Allowed (assertion, dimension) pairs (23 rows) | both | PK |
| `taxonomy_versions` | Versions of the taxonomy | `id`, `label` unique, `status` | status ∈ draft/published/retired; **at most one published** (partial unique index) |
| `taxonomy_concepts` | Concepts | `id`, `concept_key` unique, `dimension`, `start_year`, `end_year`, `scope_notes` jsonb, `attributes` jsonb | key format check; years ordered; unique `(id, dimension)` as target for composite FKs |
| `taxonomy_terms` | Labels in each language | `concept_id`, `concept_dimension`, `language`, `term`, `normalized`, `term_type`, `is_ambiguous` | composite FK to `(concept id, dimension)`; unique `(concept, language, normalized)`; **one preferred label per concept and language**; **unique preferred label per dimension and language**; language code check; btree and trigram (`gin_trgm_ops`) indexes on `normalized` |
| `taxonomy_relationships` | Typed links | `relationship_type`, `source_concept_id`/`source_dimension`, `target_concept_id`/`target_dimension`, `notes` | composite FKs pin both dimensions to the real concepts; FK to `taxonomy_relationship_rules` (**invalid type/dimension combinations rejected**); no self-links; `related` stored once (source id < target id); unique (type, source, target) |
| `taxonomy_evidence` | Why a concept/term/relationship exists | exactly one of `concept_id`/`term_id`/`relationship_id`; `lot_id`, `source`, `source_lot_id`, `source_field`, `quote`, `extractor` | `num_nonnulls(...) = 1` |
| `source_category_mappings` | Drouot category → concept (+ assertion) | `source`, `category_fr`, `category_en`, `concept_id`, `assertion` | assertion/dimension FK; unique with `NULLS NOT DISTINCT` |
| `lot_concepts` | Lot classifications (filled by `classify-lots`) | `lot_id` (= `drouot_collector.lots.id`), `source`, `source_lot_id`, `concept_id`, `assertion`, `confidence`, `method`, `evidence` jsonb, `content_hash`, `taxonomy_version_id` | assertion/dimension FK (**`dated_to` only with periods, `in_style_of` only with styles**); unique (lot, concept, assertion, version); **no FK into `drouot_collector`** |
| `alembic_version` | Applied migration revision | `version_num` | lives in `auction_search`, not `public` |

Common columns on concepts, terms, relationships and mappings: `review_status`
(candidate/approved/rejected), `confidence` (0–1), `provenance` (seed, source_category,
rule_extraction, ai_extraction, manual, search_feedback), `introduced_in_version_id`,
`retired_in_version_id` (must be later than introduced), `created_at`.

Tables added by migration `0002` (Phases 4–8):

| Table | Purpose | Key columns | Constraints / indexes |
|---|---|---|---|
| `lot_classification_state` | One row per classified lot: what it was classified with, and whether a human should look | `lot_id` PK, `source`, `source_lot_id`, `content_hash`, `taxonomy_fingerprint`, `taxonomy_scope`, `classifier_version`, `assertions`, `needs_review`, `review_reasons` text[], `classified_at` | `taxonomy_scope` ∈ draft/published; partial index on `needs_review` |
| `lot_search_documents` | Search copy of each lot: titles, description lead, category, auction key and date, lot URL, `tsv_fr` / `tsv_en` | `lot_id` PK, `content_hash`, `updated_at` | GIN indexes on `tsv_fr`, `tsv_en` |
| `search_queries` | Log of internal searches (input of Phase 10) | `id` identity, `query`, `language`, `mode`, `concepts` text[], `unresolved_terms` text[], `results`, `direct_results`, `took_ms`, `created_at` | index on `created_at` |
| `external_search_log` | Per provider and expansion: results, direct matches, error | `id` identity, `provider`, `query`, `expansion_term`, `relationship`, `priority`, `results`, `direct_matches`, `error`, `created_at` | index on (`provider`, `expansion_term`) |

Table added by migration `0003` (Phase 5) — created with raw SQL because the column type comes
from pgvector; the migration checks that the `vector` extension is installed and **refuses to run
otherwise** (it never installs extensions):

| Table | Purpose | Key columns | Indexes |
|---|---|---|---|
| `lot_embeddings` | One vector per lot and model | PK (`lot_id`, `model`), `source`, `source_lot_id`, `content_hash`, `embedding vector(384)`, `created_at` | HNSW, `vector_cosine_ops` |

None of these tables has a foreign key into `drouot_collector`; all refer to lots by `lots.id` +
`(source, lot_id)`. Downgrades of `0002`/`0003` are guarded by `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1`
like `0001`.

### 5.2 Views

| View | Content |
|---|---|
| `taxonomy_current_version` | The published version (0 or 1 row) |
| `published_concepts`, `published_terms`, `published_relationships` | Approved rows introduced in or before the published version and not retired by it — what search will use |

### 5.3 Relationships to the source data

`lot_concepts.lot_id` and `taxonomy_evidence.lot_id` hold `drouot_collector.lots.id`; `source` +
`source_lot_id` hold the business key `(source, lot_id)`. There is deliberately **no foreign key**
(approved in Phase 2). A test checks that no constraint in the schema references another schema.

### 5.4 Running migrations

| Action | Command | Effect |
|---|---|---|
| Preview SQL | `.venv/bin/alembic upgrade head --sql` | prints SQL, no connection |
| Apply | `.venv/bin/alembic upgrade head` | creates or upgrades `auction_search` to `0003`, each migration in one transaction |
| Show state | `.venv/bin/alembic current` | prints the applied revision |
| Roll back (destructive) | `AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 .venv/bin/alembic downgrade base` | drops all `auction_search` tables and their data |

## 6. Reports

`inspect-db` writes `reports/database_structure.{md,json}` and `reports/source_mapping.json`;
`analyze-lots` writes `reports/data_quality.{md,json}` and `reports/lot_samples.{md,json}`;
`validate-taxonomy` writes `reports/taxonomy_validation.{md,json}`.
`reports/migration_0001_preview.sql` is the offline SQL of migration `0001`
(`alembic upgrade 0001:0003 --sql` prints the SQL of the later migrations).
Phases 3–10 reports are listed in the README.
