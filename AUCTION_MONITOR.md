# Auction Monitor Data

The app's auctions and lots come from the auction monitor, the n8n scraper that collects sales from
auction websites such as drouot.com and stores them in its own PostgreSQL database, `auctionmonitor`.
The app's database, `french_sourcing_agent_db`, holds a copy of everything in that database.

This page records where the two databases differ, so the differences can be found and changed later.

## What was copied

On 29 October 2026, everything in `auctionmonitor` was copied into the app's database:

| Monitor object | In the app database |
|---|---|
| `auction_sources` table | Same columns, constraints and rows |
| `collection_runs` table | Same columns, constraints and rows |
| `auctions` table | Same columns, constraints and rows |
| `lots` table | Same columns and rows, plus one extra key (see below) |
| `purge_old_auctions_30d()` function | **Changed** (see below) |

The tables are created by these migrations in `backend/migrations/`:

- `1793229480339_auctions-and-lots.sql`: `auctions` and `lots`
- `1793261722297_monitor-sources-and-runs.sql`: `auction_sources`, `collection_runs` and the monitor's purge function
- `1793262192640_purge-keeps-requested-sales.sql`: the app's version of the purge function

## ⚠️ Difference 1: the 30-day purge keeps sales with bid requests

`purge_old_auctions_30d()` deletes sales more than 30 days old, with their lots. The app's version
skips any sale that has a bid request, whatever the request's status (pending, rejected, won, and so on).

| Sale | Monitor's version | App's version |
|---|---|---|
| More than 30 days old, no bid requests | Deleted, with its lots | Deleted, with its lots |
| More than 30 days old, with bid requests | Not possible in `auctionmonitor`, which has no bid requests. Run on the app's database, the whole purge fails with an error and deletes nothing. | Kept, with all its lots |
| 30 days old or less | Kept | Kept |
| No sale date (`auction_date` is empty) | Kept | Kept |

**Why:** the app won't let a requested lot be deleted (see Difference 2), so the monitor's version
would fail as soon as any old sale had a request. Keeping those sales also keeps each customer's
request and its result on record.

**The code:** the only change is the extra `NOT EXISTS` condition, added to both deletes:

```sql
DELETE FROM lots WHERE auction_id IN (
  SELECT a.id FROM auctions a
  WHERE a.auction_date < current_date - 30
    AND NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.auction_id = a.id)  -- app only
);
DELETE FROM auctions a
WHERE a.auction_date < current_date - 30
  AND NOT EXISTS (SELECT 1 FROM bid_requests r WHERE r.auction_id = a.id);   -- app only
```

**Where it's used:** nothing in the app calls the purge. The function only matters if the scraper is
pointed at the app's database and runs it there.

**Things you might change later:**

- Keep requested sales for a while, then purge them too, for example after a year.
- Keep only sales whose requests reached a result (won or lost), and purge sales with only rejected
  or cancelled requests. Their requests would have to be deleted first.
- Keep the requested lots, but delete the unrequested lots of a requested sale.

**How to change it:**

1. Create a migration: `npm --prefix backend run migrate:create -- <name>`.
2. In its up section, write the new function with `CREATE OR REPLACE FUNCTION purge_old_auctions_30d()`.
   In its down section, put back the current version.
3. Run it with `npm --prefix backend run migrate:up`.
4. Update the test "the 30-day purge deletes old sales and their lots, but keeps those with bid
   requests" in `backend/test/schema.test.ts`, and run `npm --prefix backend test`.
5. Update this page and the Database section of `SPEC.md`.

To return to the monitor's exact version, `npm --prefix backend run migrate:down` works while
`1793262192640_purge-keeps-requested-sales.sql` is the latest migration. After later migrations,
add a new migration that restores the monitor's version instead.

## Difference 2: bid requests are linked to lots

The app's `bid_requests` table points at the lot a customer asked about:

- `bid_requests_lot_auction_fkey`: `FOREIGN KEY (lot_id, auction_id) REFERENCES lots (id, auction_id) ON DELETE RESTRICT`.
  A lot with a bid request, and its sale, can't be deleted.
- `lots_id_auction_id_key`: `UNIQUE (id, auction_id)` on `lots`. This is the extra key, there only so
  the foreign key above can check that the lot belongs to the sale the request names.

`auctionmonitor` has neither. If the scraper writes to the app's database, updating lots in place
works, but deleting and re-inserting a requested lot fails.

## Other differences

- **Test data:** automated tests add sales under a disabled source with id 0, called "Automated
  tests", and their own test sales and lots. `npm --prefix backend run test:cleanup -- e2e-` and the
  test runs themselves remove them afterwards.
- **Next ids:** test sales use up ids, so the app's next `auctions`, `lots` and `collection_runs`
  ids run ahead of the monitor's. The rows themselves keep the monitor's ids.
- **Freshness:** the scraper still writes to `auctionmonitor`. New sales and lots don't reach the
  app until the scraper is pointed at the app's database or the data is copied again.

## Copying the data again

This is how the copy on 29 October 2026 was made. It replaces every sale in the app's database, so it
only works while there are **no bid requests**: a requested lot can't be deleted.

1. Back up the app's database with `pg_dump -Fc`.
2. Delete everything from `lots`, then `auctions`.
3. Dump the four tables' rows from `auctionmonitor`:
   `pg_dump --data-only -t public.auction_sources -t public.collection_runs -t public.auctions -t public.lots auctionmonitor`.
   This also sets the next ids to match the monitor.
4. Load that file into the app's database with `psql -v ON_ERROR_STOP=1 --single-transaction`.
5. Check that the row counts match in both databases.

Use the PostgreSQL 15 tools, the same version as the server. Take the connection settings from
`backend/.env` and never put the password on the command line or in this file.

Once customers have made bid requests, a refresh has to add and update sales and lots by their
`(source_id, external_id)` and `(auction_id, external_id)` keys instead of replacing them.
