# The collector in five files

Start the app with `npm start`. This runs the API and the background worker. PostgreSQL is the source of truth; CSVs are copies of saved rows.

| File | Job |
| --- | --- |
| `src/server.js` | Reads settings, starts Express, validates API requests, and starts or stops the worker. The same entry point accepts `worker` for a worker-only process or `migrate` to create the schema. |
| `src/drouot.js` | Downloads Drouot pages with delays, timeouts and retries; checks URLs; parses auction, catalogue and lot HTML/JSON-LD. |
| `src/collection.js` | Runs a collection: discover auctions, save pages and lots, track progress, resume interrupted jobs, then generate CSVs. |
| `src/database.js` | Opens PostgreSQL connections and contains the SQL functions used by the API and worker. It also applies `migrations/001_collector.sql`. |
| `src/csv.js` | Streams database rows to `collected-auctions.csv` and `collected-lots.csv`, or to the CSV download endpoints. |

## What happens when you collect

1. `POST /api/collections` in `server.js` inserts a queued job and immediately returns its ID.
2. The worker in `collection.js` claims that job from PostgreSQL.
3. `drouot.js` fetches and parses the listing, auction pages, catalogue pages and lot pages.
4. `database.js` saves each auction, page and lot as it is processed. A failure does not erase earlier rows.
5. `csv.js` writes both `collected-*.csv` files from the saved rows before the job is marked complete or partial.

`migrations/001_collector.sql` defines five tables in the `drouot_collector` schema: `auctions` and `lots` hold source data; `collection_runs`, `run_auctions` and `catalogue_pages` hold progress and recovery checkpoints. Existing `public` tables are not changed.

The `tests/` folder contains parser, automatic-export and optional disposable-database tests. The older EventsMonitor documents in `docs/` predate this standalone collector and were left untouched.
