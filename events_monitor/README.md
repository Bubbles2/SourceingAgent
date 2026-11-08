# Drouot Auction Collector

> **In the Sourcing agent:** this folder is the Sourcing agent's Drouot collector. How it shares
> `events_monitor_db` with the site and the taxonomy search, how to run it (`npm run collector`) and what was
> not copied: [INTEGRATION.md](INTEGRATION.md).

Standalone Node.js/Express collector for upcoming Drouot auctions and catalogue lots. It uses ordinary HTTP requests, Cheerio and PostgreSQL. It makes no AI calls and does not depend on n8n. The existing root `auctions.csv` and `lots.csv` are untouched.

For a file-by-file explanation, see the [program guide](docs/PROGRAM_GUIDE.md).

## Requirements and setup

- Node.js 24 or newer (LTS), PostgreSQL, npm.
- A PostgreSQL database and role with permission to create the isolated `drouot_collector` schema. The default example uses `events_monitor_db`; the migration does not modify existing `public.auctions` or `public.lots`.
- Permission to access and collect from the source website under its current terms and access rules. Review [Drouot's terms](https://drouot.com/en/cgu) and [robots.txt](https://drouot.com/robots.txt) before operating at scale. The collector does not bypass login, CAPTCHA or rate limits.

```sh
npm ci
cp .env.example .env
# Edit .env: set DATABASE_URL and a random COLLECTION_API_KEY (24+ characters).
npm run migrate
npm start
```

The scripts load `.env` automatically. On `npm start`, answer the VPN question, then enter a maximum number of lots per auction for testing (1–998). Enter `999` for no lot limit. The answer is stored with each new collection job, so resuming that job keeps its limit. The server listens on `PORT` (default 3000). `GET /api/health` checks database connectivity. Stop with Ctrl-C or SIGTERM. For deployment, run the API under a service manager. To run a separate worker process, set `WORKER_ENABLED=false` on the API and start `npm run worker` under the service manager. Only one worker is needed initially; database row locking permits more if required.

All settings are shown in [.env.example](.env.example). `HTTP_DELAY_MS` is the delay between request starts; `HTTP_TIMEOUT_MS`, `HTTP_MAX_BYTES`, `HTTP_RETRIES`, `MAX_AUCTIONS` and `MAX_CATALOGUE_PAGES` bound work and resources. No collection starts until a queued job exists. The API key protects start and resume operations; do not expose it in a browser application or commit `.env`.

## API and operations

Set `BASE=http://localhost:3000` and replace `<token>` below with `COLLECTION_API_KEY`.

```sh
curl "$BASE/api/health"

# Collect up to two auctions not already stored by the collector. Returns HTTP 202 with a job ID promptly.
curl -X POST "$BASE/api/collections" \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"source":"drouot","maxAuctions":2,"includeLots":true,"languages":["fr","en"]}'

# Collect 30 auctions. Raise MAX_AUCTIONS if configured lower.
curl -X POST "$BASE/api/collections" \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"source":"drouot","maxAuctions":30,"includeLots":true,"languages":["fr","en"]}'

curl "$BASE/api/collections/1"
# Show the most recent active job, or null when none is running.
curl "$BASE/api/collections/running" -H 'Authorization: Bearer <token>'
curl "$BASE/api/auctions?limit=50&after=0"
curl "$BASE/api/auctions/1"
curl "$BASE/api/auctions/1/lots?limit=50&after=0"

# Resume a failed or partial run; it retains the same ID.
curl -X POST "$BASE/api/collections/1/resume" -H 'Authorization: Bearer <token>'

# Optional: download an on-demand copy; completed runs write files automatically.
curl "$BASE/api/exports/auctions.csv" -o exports-auctions.csv
curl "$BASE/api/exports/lots.csv" -o exports-lots.csv
```

The `:id` in auction routes is the internal database ID; `auction_id` in each record is Drouot's ID. List endpoints use keyset pagination: pass the final item's `id` as `after`. Run status is `queued`, `running`, `completed`, `partial` or `failed`. A `partial` run has missing pages, lots or source fields and is never presented as complete. `last_error`, auction statuses and structured server logs identify failures. A stopped worker leaves a leased `running` job; when the lease expires (up to 90 seconds), a worker claims it again. Resume failed/partial runs with the endpoint above. Previously committed auction and lot rows remain available.

New jobs skip any auction ID already stored in `drouot_collector.auctions`, which is the source of the generated `collected-auctions.csv`. Discovery continues through upcoming-auction listing pages until it selects `maxAuctions` new auctions or runs out of listing pages. If the configured page limit is reached first, the run is marked partial. Resume an existing partial or failed job to finish its already selected auctions.

The API refreshes `collected-auctions.csv` and `collected-lots.csv` from committed database rows when it starts. The worker refreshes both files again after each collection run finishes. A partial run still produces files containing the rows saved so far. File generation happens before the run is marked complete; a file error marks the run failed so it can be resumed. The original root `auctions.csv` and `lots.csv` are never overwritten. The export endpoints remain available for an on-demand refresh.

Both automatic files and HTTP CSV endpoints stream database rows in 500-row keyset batches. They preserve the original n8n headers and order, with quoted fields and CRLF line endings. Missing source values are empty CSV cells. A spreadsheet may interpret source text beginning with `=` as a formula; treat exported files as untrusted source data when opening them in spreadsheet software.

## Architecture and source extension

The application has five source files: `src/server.js` (API, settings, process modes), `src/drouot.js` (HTTP and Drouot parsing), `src/collection.js` (job workflow), `src/database.js` (PostgreSQL), and `src/csv.js` (exports). The queue uses PostgreSQL `FOR UPDATE SKIP LOCKED`, a 90-second lease and periodic heartbeats; no Redis or n8n is needed. See the [program guide](docs/PROGRAM_GUIDE.md) for the call flow.

Each catalogue page is committed with its discovered lot links. Lot details are saved individually, two at a time; page HTML is discarded after parsing. A new source should provide its own URL, listing, auction, catalogue and lot parsers and host policy. The current schema and queue are scoped to Drouot; adding another source requires a versioned schema extension and adapter registration, without changing the HTTP API or CSV streaming pattern.

## Tests and diagnosis

```sh
npm test
TEST_DATABASE_URL=postgres://user:password@localhost:5432/collector_test npm test
```

The first command runs parser, validation and CSV tests. The second also runs an integration test against a **disposable database where the migration has already been applied**. The integration test writes rows and checks idempotency, resume, expired-lease recovery, auth and CSV output. It does not delete the database. See [phase record](docs/IMPLEMENTATION_PHASES.md) for live checks and current limits.

For startup errors, verify `DATABASE_URL`, database reachability, that `npm run migrate` succeeded, and the API key length. For collection errors, inspect the run's `last_error`, `drouot_collector.run_auctions`, `drouot_collector.catalogue_pages`, and JSON logs by `runId`. HTTP retries are logged without credentials. If Drouot changes its HTML, update only the source parser and its tests. No full catalogue run is launched as part of startup or tests.
