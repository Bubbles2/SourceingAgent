# The Drouot collector inside the Sourcing agent

This folder is the Drouot collector (EventsMonitor), copied on 2026-11-08 from `Development/AI/EventsMonitor`
(all files as they were on disk, Git history not included). It collects upcoming Drouot sales and their lots and
saves them in PostgreSQL. It is unchanged except for this file and the note at the top of `README.md`.

## One database for every application

```
events_monitor/ (this collector) ── writes ──► events_monitor_db.drouot_collector  (auctions, lots, collection runs)
                                                        │ read only
                         ┌──────────────────────────────┼──────────────────────────────┐
                         ▼                                                              ▼
   Sourcing agent (backend/, src/)                                       taxonomy_search/
   views sourcing_agent.auctions / lots                                  classifies, indexes and searches
   (users, sessions, bid requests in sourcing_agent)                     the same lots (auction_search)
```

- The collector's schema is fixed in its code (`src/database.js`: `drouot_collector`), and `DATABASE_URL` in
  `events_monitor/.env` points at `events_monitor_db`. Its tables are the only copy of the auctions and lots: the
  site reads them live through its views, and the taxonomy search works on the same lot ids.
- The old CSV data of the original folder (`auctions.csv`, `lots.csv`, `df1-*.csv`) is **not** part of this copy;
  nothing in the collector read it. After each run the collector still exports `collected-auctions.csv` and
  `collected-lots.csv` here (git-ignored), generated from the database.

## Running it

```bash
npm run collector
```

(the same as `cd events_monitor && npm start`). It asks two questions first: whether you are on a VPN (it stops
unless you answer yes) and the maximum number of lots per auction (999 = no limit). Because of these questions it
runs in a terminal, not from `.claude/launch.json`. It listens on port 3000; stop it with Ctrl-C.

Its worker starts with it (`WORKER_ENABLED=true`) and **resumes any queued, running or partial collection run**
straight away; on 2026-11-08 there were 4 such runs in the database.

## How the Sourcing agent uses it

- **Administration → Collections** starts a run (`POST http://localhost:3000/api/collections`, `collection_root`
  in `backend/.env`), and **Collection status** follows it. The back end sends `collection_token`, which must equal
  `COLLECTION_API_KEY` in `events_monitor/.env` (they match).
- New sales appear on the site as soon as the collector saves them (no copy step). Then run **Administration →
  Search → Run & maintain → Maintain** so the taxonomy search indexes, classifies and embeds the new lots.

## Settings

`events_monitor/.env` (git-ignored; template `.env.example`): `DATABASE_URL`, `COLLECTION_API_KEY`, `PORT` (3000),
`WORKER_ENABLED`, HTTP timeouts, delays, retries and size limits, `MAX_AUCTIONS`, `MAX_CATALOGUE_PAGES`. Never put
the key or the database password anywhere else.

## Hooks in the Sourcing agent

| File | Change |
|---|---|
| `package.json` | `npm run collector` |
| `SPEC.md`, `AUCTION_MONITOR.md` | where the collector's code lives |

Nothing else changed: the back end already called the collector on port 3000 for the Collections pages.

## Not copied

`.git` (history stays in the original folder), `node_modules` (installed again with `npm ci`), the CSV files, the
`cmd` example file (it contained the collection key in plain text), the coding-agent folders `.agents/` and `.codex/`,
and `.DS_Store` files. The original `Development/AI/EventsMonitor` folder is unchanged.
