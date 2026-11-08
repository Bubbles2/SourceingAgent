# Auction and Lot Data

The app's auctions and lots come from the **Drouot collector**, which collects sales and their lots
from drouot.com and stores them in the `drouot_collector` schema of the PostgreSQL database
`events_monitor_db`. The app reads them there directly, through two views. It never copies, changes
or deletes the collector's data.

The collector's code is in `events_monitor/` in this repository; `npm run collector` starts it. See
`events_monitor/INTEGRATION.md`.

This page documents where the data lives, how the views map the collector's columns to the ones the
app uses, what the collector doesn't provide, and how the data is refreshed.

## Where everything lives

Everything is in one database, `events_monitor_db` (local PostgreSQL 18, `localhost:5432`):

| Schema | Owner | What the app does with it |
|---|---|---|
| `sourcing_agent` | This app | Its own tables, the `auctions` and `lots` views, and the test sales. Every connection's `search_path`. |
| `drouot_collector` | The Drouot collector | Reads `auctions` and `lots`, only through the views. **Never written.** |
| `auction_search` | The taxonomy search project | Not used, never touched. |
| `public` | Another app (its own `auctions`, `lots`, `auction_sources`, `collection_runs`) | Not used, never touched. |

The connection is set in `backend/.env`: `DB_NAME=events_monitor_db` and `DB_SCHEMA=sourcing_agent`.
`backend/src/db/pool.ts` starts every session with `search_path` set to `DB_SCHEMA` only, so the
app's unqualified table names (`users`, `bid_requests`, `auctions`, `lots`…) resolve there and
nowhere else; `public` isn't on the path. `npm --prefix backend run migrate:up` creates the schema if
it's missing and keeps its migration log in `sourcing_agent.pgmigrations`.

The database user needs to be able to create the schema (or own it), and the owner of the views needs
`USAGE` on `drouot_collector` and `SELECT` on `drouot_collector.auctions` and `drouot_collector.lots`.

The app's own tables in `sourcing_agent`: `users`, `sessions`, `auth_tokens`, `email_outbox`,
`bid_requests`, `request_status_history`, `test_auctions`, `test_lots` and `pgmigrations`.

## The views

`backend/migrations/1794160923885_collector-catalogue.sql` creates `sourcing_agent.auctions` and
`sourcing_agent.lots`. Each is the collector's rows `UNION ALL` the app's test rows (see
[Test sales](#test-sales)). They keep the column names and types the app's old copied tables had, so
the repositories' queries and the API's responses didn't change. Because of the `UNION ALL`, the
views can't be written: an `INSERT`, `UPDATE` or `DELETE` on them fails.

### `auctions`

| View column | Type | From `drouot_collector.auctions` |
|---|---|---|
| `id` | bigint | `id` |
| `external_id` | text | `auction_id` (Drouot's sale id) |
| `title` | text | `coalesce(title_en, title_fr)`; when both are empty, `Drouot sale <auction_id>` |
| `starts_at` | timestamptz | `starts_at` |
| `ends_at` | timestamptz | always `NULL` |
| `auction_date` | date | `auction_date` |
| `location` | text | `auction_house` |
| `catalogue_url` | text | `coalesce(auction_url_en, auction_url_fr)` |
| `source_url` | text | `coalesce(auction_url_fr, auction_url_en)` |
| `status` | text | `catalogue_status` (`completed` or `partial`) |

### `lots`

| View column | Type | From `drouot_collector.lots` |
|---|---|---|
| `id` | bigint | `id` |
| `auction_id` | bigint | the `id` of the sale in `drouot_collector.auctions` with the same `(source, auction_id)` |
| `external_id` | text | `lot_id` (Drouot's lot id) |
| `lot_number` | text | `lot_number` |
| `title` | text | `title_fr` (the original French) |
| `description` | text | `description_fr` |
| `category` | text | `coalesce(category_en, category_fr)` |
| `maker` | text | always `NULL` |
| `materials` | text[] | always empty (`{}`) |
| `estimate_low`, `estimate_high` | numeric(14,2) | always `NULL` |
| `currency` | character(3) | `currency` (EUR, GBP, CHF, SEK…) |
| `image_url` | text | `image_url` |
| `source_url` | text | `coalesce(lot_url_en, lot_url_fr)` |
| `titleuk` | text | `title_en` (the English translation) |
| `descriptionuk` | text | `description_en` |
| `ai_category`, `ai_summary` | text | always `NULL` |

Ids stay `bigint`, so the API returns them as strings as before; estimates are `numeric(14,2)`, which
the API returns as exact decimal strings such as `"1500.00"`, or `null`.

## What the collector doesn't provide

- **Estimates.** Drouot's estimates aren't collected, so lots show no estimate.
- **Maker and materials.** Not collected; `maker` is empty and `materials` an empty list.
- **Location.** The collector has no city or address. `location` holds the **auction house's name**
  (for example "Estim Nation"), which is what the website shows where it used to show a location.
- **End time.** Sales have a start time and a sale day only; `ends_at` is always empty.
- **AI category and summary.** The old auction monitor's AI analysis has no equivalent.
- **Titles of partly collected sales.** Some sales whose details the collector couldn't read have no
  title in either language (and usually no date or lots yet). The view names them
  `Drouot sale <id>`, because the app gives every sale a title. Without a date they count as
  completed and take no bid requests.

Showing estimates or a maker again needs the collector to collect them; the views would then map its
new columns instead of `NULL`.

## Refreshing the data

There is nothing to copy: the views read the collector's tables live. New and updated sales and lots
appear in the app as soon as the collector saves them.

To collect, an administrator runs the collector from the admin **Collections** pages
(`/admin/collections`, with progress on `/admin/collection-status`). The app passes the request to
the collection API (`collection_root` in `backend/.env`, port 3000), which runs the collector against
`drouot_collector`.

The collector decides what it keeps. If it ever deletes a lot (or a sale) that has bid requests,
the requests stay in `bid_requests`, but they no longer appear in My requests, the review queue or
Requested lots, which join each request to its lot and sale.

## Bid requests and lots

`bid_requests.lot_id` and `bid_requests.auction_id` hold the view's ids, which are the collector's
ids (or a test sale's). There is no foreign key to the lot, since lots are a view: the old
`bid_requests_lot_auction_fkey` was dropped. Instead, `createBidRequest`
(`backend/src/api/bid-requests/bidRequestsService.ts`) checks, in one transaction, that the sale exists
and is still open and that the lot exists and belongs to that sale. `findRequestTarget` takes
`pg_advisory_xact_lock(<lot id>)` first, so two requests for the same lot are checked one after the
other (the lock is released when the transaction ends). The two unique indexes on `bid_requests` (one
reserving request per lot, one open request per customer and lot) still back up those rules.

## Test sales

Automated tests (backend tests and Playwright) can't add sales to the collector's tables, so they use
two tables of the app's own, which the views add to the collector's rows:

- `test_auctions`: the `auctions` view's columns, with `external_id` unique.
- `test_lots`: the `lots` view's columns, with `(auction_id, external_id)` unique and `auction_id`
  referencing `test_auctions`.

Their ids come from one sequence, `test_sales_id_seq`, starting at 900000000001, and a check keeps
them there, so a test id can never be a collector id. Test sales have external ids with a test
prefix (`e2e-`, `bidtest-`, `authtest-`, `saletest-`…). `npm --prefix backend run sale:test` adds one;
`npm --prefix backend run test:cleanup -- e2e-` and the test runs themselves delete them, with their
bid requests. Both tables are empty outside test runs.

## History

- Until 8 November 2026 the app had its own database, `french_sourcing_agent_db`, with tables copied
  from the n8n auction monitor (`auctions`, `lots`, `auction_sources`, `collection_runs` and a 30-day
  purge function). That database is left as it was and is no longer used.
- On 8 November 2026 the existing migrations were replayed into `events_monitor_db.sourcing_agent`,
  and `1794160923885_collector-catalogue.sql` replaced the copied tables and the purge function with
  the views and the test tables. It refuses to run if `bid_requests` has rows, since their lot ids
  would point at unrelated collector lots. Its down migration brings back the empty copied tables, the
  purge function and the lot foreign key, deleting all bid requests and their history first.
- The five user accounts (ids, password hashes, roles and verification dates) were copied once from
  `french_sourcing_agent_db.users`. Sessions, tokens, emails, bid requests and their history were not
  copied: users sign in again.
