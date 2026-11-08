# Database structure report

- Generated: 2026-11-07T17:43:16+00:00
- Target: `postgresql://(libpq default user)@localhost:5432/events_monitor_db schema=drouot_collector`
- Mode: read-only session (`default_transaction_read_only=on`); no data was modified.

## 1. Server

| Property | Value |
|---|---|
| PostgreSQL version | 18.4 (Homebrew) |
| Database | events_monitor_db |
| Connected as | dcfinlay |
| Superuser | yes |
| Can create schemas (CREATE on database) | yes |
| Application schema `auction_search` exists | no |

## 2. Extensions

| Extension | Installed | Installed in schema | Available (default version) | Requires superuser | Trusted |
|---|---|---|---|---|---|
| vector | 0.8.7 | public | 0.8.7 | yes | no |
| pg_trgm | 1.6 | public | 1.6 | yes | yes |
| unaccent | no |  | 1.1 | yes | yes |
| fuzzystrmatch | no |  | 1.2 | yes | yes |

All installed extensions: `pg_trgm` 1.6 (public), `plpgsql` 1.0 (pg_catalog), `vector` 0.8.7 (public)

## 3. Full-text search configurations

Available: `arabic`, `armenian`, `basque`, `catalan`, `danish`, `dutch`, `english`, `estonian`, `finnish`, `french`, `german`, `greek`, `hindi`, `hungarian`, `indonesian`, `irish`, `italian`, `lithuanian`, `nepali`, `norwegian`, `portuguese`, `romanian`, `russian`, `serbian`, `simple`, `spanish`, `swedish`, `tamil`, `turkish`, `yiddish`

## 4. Schemas in the database

| Schema | Tables | Views | Size |
|---|---|---|---|
| `drouot_collector` ← source | 5 | 0 | 33.9 MB |
| `drouot_collector_py` | 5 | 0 | 9.4 MB |
| `public` | 12 | 2 | 1.5 MB |

## 5. Auction and lot tables detected in `drouot_collector`

- Auction table: `auctions`
- Lot table: `lots`
- Confirmed by foreign key: yes

Evidence:

- auction table 'auctions' chosen from candidates auctions(score 5), run_auctions(score 1)
- lot table 'lots' chosen from candidates lots(score 7)
- foreign key lots(source, auction_id) -> auctions(source, auction_id)

## 6. Relationships (foreign keys)

- `catalogue_pages(run_id) -> drouot_collector.collection_runs(id)`
- `lots(last_collected_run_id) -> drouot_collector.collection_runs(id)`
- `lots(source, auction_id) -> drouot_collector.auctions(source, auction_id)`
- `run_auctions(run_id) -> drouot_collector.collection_runs(id)`
- `run_auctions(source, auction_id) -> drouot_collector.auctions(source, auction_id)`

## 7. Source mapping (column roles used by later phases)

Roles are inferred from column names and types; see `reports/source_mapping.json`.

Join: `lots.source` = `auctions.source`, `lots.auction_id` = `auctions.auction_id`

**Auctions** — `drouot_collector.auctions`, primary key `id`

| Role | Columns |
|---|---|
| auction_house | `auction_house` |
| count | `catalogue_page_count` |
| date | `starts_at`, `auction_date` |
| description | `description_fr` (fr), `description_en` (en) |
| error | `last_error` |
| identifier | `id`, `auction_id` |
| record_timestamp | `updated_at` |
| source | `source` |
| status | `details_status`, `catalogue_status` |
| title | `title_fr` (fr), `title_en` (en) |
| url | `auction_url_fr` (fr), `auction_url_en` (en) |

**Lots** — `drouot_collector.lots`, primary key `id`

| Role | Columns |
|---|---|
| category | `category_fr` (fr), `category_en` (en) |
| currency | `currency` |
| description | `description_fr` (fr), `description_en` (en) |
| error | `last_error` |
| identifier | `id`, `auction_id`, `lot_id`, `last_collected_run_id` |
| image_url | `image_url` |
| lot_number | `lot_number` |
| record_timestamp | `updated_at` |
| source | `source` |
| status | `details_status` |
| title | `title_fr` (fr), `title_en` (en) |
| url | `lot_url_fr` (fr), `lot_url_en` (en) |


## 8. Tables in `drouot_collector`

### `auctions` (table)

- Rows: **122** — total size 136.0 kB
- Primary key: `id`
- Unique `auctions_source_auction_id_key`: (source, auction_id)
- Referenced by: `lots(source, auction_id)`
- Referenced by: `run_auctions(source, auction_id)`
- Indexes:
  - `CREATE UNIQUE INDEX auctions_pkey ON drouot_collector.auctions USING btree (id)`
  - `CREATE UNIQUE INDEX auctions_source_auction_id_key ON drouot_collector.auctions USING btree (source, auction_id)`

| Column | Type | Nullable | Default | Inferred role | Lang |
|---|---|---|---|---|---|
| `id` | bigint | no | generated always as identity | identifier |  |
| `source` | text | no | 'drouot'::text | source |  |
| `auction_id` | text | no |  | identifier |  |
| `title_fr` | text | yes |  | title | fr |
| `description_fr` | text | yes |  | description | fr |
| `title_en` | text | yes |  | title | en |
| `description_en` | text | yes |  | description | en |
| `starts_at` | timestamp with time zone | yes |  | date |  |
| `auction_date` | date | yes |  | date |  |
| `auction_house` | text | yes |  | auction_house |  |
| `catalogue_page_count` | integer | yes |  | count |  |
| `auction_url_fr` | text | no |  | url | fr |
| `auction_url_en` | text | no |  | url | en |
| `details_status` | text | no | 'pending'::text | status |  |
| `catalogue_status` | text | no | 'pending'::text | status |  |
| `last_error` | text | yes |  | error |  |
| `updated_at` | timestamp with time zone | no | now() | record_timestamp |  |

### `catalogue_pages` (table)

- Rows: **300** — total size 88.0 kB
- Primary key: `run_id, auction_id, page_number`
- Foreign key `catalogue_pages_run_id_fkey`: (run_id) → `drouot_collector.collection_runs` (id)
- Indexes:
  - `CREATE UNIQUE INDEX catalogue_pages_pkey ON drouot_collector.catalogue_pages USING btree (run_id, auction_id, page_number)`

| Column | Type | Nullable | Default | Inferred role | Lang |
|---|---|---|---|---|---|
| `run_id` | bigint | no |  | identifier |  |
| `auction_id` | text | no |  | identifier |  |
| `page_number` | integer | no |  | other |  |
| `status` | text | no | 'pending'::text | status |  |
| `lot_count` | integer | no | 0 | count |  |
| `last_error` | text | yes |  | error |  |

### `collection_runs` (table)

- Rows: **19** — total size 80.0 kB
- Primary key: `id`
- Referenced by: `catalogue_pages(run_id)`
- Referenced by: `lots(last_collected_run_id)`
- Referenced by: `run_auctions(run_id)`
- Check `collection_runs_source_check`: `source = 'drouot'::text`
- Check `collection_runs_status_check`: `status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'partial'::text, 'failed'::text])`
- Indexes:
  - `CREATE UNIQUE INDEX collection_runs_pkey ON drouot_collector.collection_runs USING btree (id)`
  - `CREATE INDEX collector_runs_claim_idx ON drouot_collector.collection_runs USING btree (status, lease_until, id)`

| Column | Type | Nullable | Default | Inferred role | Lang |
|---|---|---|---|---|---|
| `id` | bigint | no | generated always as identity | identifier |  |
| `source` | text | no |  | source |  |
| `options` | jsonb | no |  | metadata |  |
| `status` | text | no |  | status |  |
| `started_at` | timestamp with time zone | yes |  | date |  |
| `completed_at` | timestamp with time zone | yes |  | date |  |
| `lease_until` | timestamp with time zone | yes |  | date |  |
| `auctions_discovered` | integer | no | 0 | other |  |
| `auctions_processed` | integer | no | 0 | other |  |
| `lots_discovered` | integer | no | 0 | other |  |
| `lots_saved` | integer | no | 0 | other |  |
| `lots_failed` | integer | no | 0 | other |  |
| `last_error` | text | yes |  | error |  |
| `created_at` | timestamp with time zone | no | now() | record_timestamp |  |

### `lots` (table)

- Rows: **20,923** — total size 33.5 MB
- Primary key: `id`
- Unique `lots_source_lot_id_key`: (source, lot_id)
- Foreign key `lots_last_collected_run_id_fkey`: (last_collected_run_id) → `drouot_collector.collection_runs` (id)
- Foreign key `lots_source_auction_id_fkey`: (source, auction_id) → `drouot_collector.auctions` (source, auction_id)
- Indexes:
  - `CREATE INDEX collector_lots_auction_idx ON drouot_collector.lots USING btree (source, auction_id, id)`
  - `CREATE UNIQUE INDEX lots_pkey ON drouot_collector.lots USING btree (id)`
  - `CREATE UNIQUE INDEX lots_source_lot_id_key ON drouot_collector.lots USING btree (source, lot_id)`

| Column | Type | Nullable | Default | Inferred role | Lang |
|---|---|---|---|---|---|
| `id` | bigint | no | generated always as identity | identifier |  |
| `source` | text | no | 'drouot'::text | source |  |
| `auction_id` | text | no |  | identifier |  |
| `lot_id` | text | no |  | identifier |  |
| `lot_number` | text | yes |  | lot_number |  |
| `title_fr` | text | yes |  | title | fr |
| `description_fr` | text | yes |  | description | fr |
| `title_en` | text | yes |  | title | en |
| `description_en` | text | yes |  | description | en |
| `category_fr` | text | yes |  | category | fr |
| `category_en` | text | yes |  | category | en |
| `currency` | text | yes |  | currency |  |
| `image_url` | text | yes |  | image_url |  |
| `lot_url_fr` | text | no |  | url | fr |
| `lot_url_en` | text | no |  | url | en |
| `details_status` | text | no | 'pending'::text | status |  |
| `last_collected_run_id` | bigint | yes |  | identifier |  |
| `last_error` | text | yes |  | error |  |
| `updated_at` | timestamp with time zone | no | now() | record_timestamp |  |

### `run_auctions` (table)

- Rows: **136** — total size 64.0 kB
- Primary key: `run_id, auction_id`
- Foreign key `run_auctions_run_id_fkey`: (run_id) → `drouot_collector.collection_runs` (id)
- Foreign key `run_auctions_source_auction_id_fkey`: (source, auction_id) → `drouot_collector.auctions` (source, auction_id)
- Check `run_auctions_source_check`: `source = 'drouot'::text`
- Indexes:
  - `CREATE UNIQUE INDEX run_auctions_pkey ON drouot_collector.run_auctions USING btree (run_id, auction_id)`

| Column | Type | Nullable | Default | Inferred role | Lang |
|---|---|---|---|---|---|
| `run_id` | bigint | no |  | identifier |  |
| `source` | text | no | 'drouot'::text | source |  |
| `auction_id` | text | no |  | identifier |  |
| `status` | text | no | 'pending'::text | status |  |
| `last_error` | text | yes |  | error |  |

