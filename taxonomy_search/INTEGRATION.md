# Taxonomy search inside the Sourcing agent

This folder is the taxonomy search project (copied on 2026-11-08 from
`Development/AI/taxonomy_driven_search`, all files as they were on disk), plus what it needs to serve the
Sourcing agent. Everything specific to the taxonomy search lives here; the Sourcing agent only has the
small hooks listed below.

```
browser ── /search, /admin/search ──► Vite site (src/ + taxonomy_search/web/)
                                          │  /api (same origin)
                                          ▼
                              Node back end (backend/)          checks the session, administrator role, CSRF
                     /api/search  ·  /api/admin/search/*
                                          │  X-Service-Token, 127.0.0.1:8000
                                          ▼
                     taxonomy search service (taxonomy_search/, Python, FastAPI)
                                          │
                                          ▼
               events_monitor_db: auction_search (taxonomy, classifications, indexes, embeddings, logs)
                                  drouot_collector (sales and lots written by events_monitor/, read only here)
```

## Running it

One-time set-up (already done on this machine):

```bash
cd taxonomy_search && /opt/homebrew/bin/python3.14 -m venv .venv && .venv/bin/python -m pip install -e ".[all]"
```

The service and the Node back end share a secret: `TAXONOMY_SERVICE_TOKEN`, in `taxonomy_search/.env` **and**
`backend/.env` (both git-ignored; generate one with
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`). Never put it anywhere else.

Start the three servers (or use the `taxonomy`, `api` and `web` entries of `.claude/launch.json`):

```bash
npm run taxonomy
```

```bash
npm --prefix backend run dev
```

```bash
npm run dev
```

Without the service, `/search` and the admin Search tab show "The search service is not running"; the rest of
the site works.

## What it adds to the Sourcing agent

- **Site search** (`/search`, the header search box): the taxonomy search. Results are the site's own lots (same
  cards as the lot lists, with "Request a bid" for upcoming sales), lots matching every part of the query first,
  then related suggestions, each with why it matched. Modes exact / broad / exploratory; the default is set by
  administrators.
- **Administration → Search** (`/admin/search`), four tabs:
  - **Run & maintain** — status (lots indexed, classified, embedded; versions) and jobs: Maintain (after each
    collection run), rebuild the index, classify, compute embeddings, extract candidates. One job at a time, with
    its log.
  - **Taxonomy review** — candidates with filters, approve / reject / correct labels (always previewed as a dry
    run first), CSV export and import, publication check and publishing (confirmed in a dialog).
  - **Search tools** — the keywords the taxonomy builds for a query (AND/OR query and phrases usable in any search
    engine or API), a test of the site search and of the external providers (tests are not logged), the default
    search mode.
  - **Quality** — evaluation metrics against the baseline, evaluation / regression / improvement-proposal jobs, the
    search log with the words not understood, the reports.

## Hooks in the Sourcing agent (every file outside this folder)

| File | Change |
|---|---|
| `backend/src/services/taxonomySearchClient.ts` | **new** — calls the service with the token and timeouts; turns its answers into the site's error format |
| `backend/src/api/taxonomySearchProxy.ts` | **new** — `/api/admin/search/*`: each admin route listed, validated (Zod), rate-limited where it changes something, forwarded |
| `backend/src/api/admin/index.ts` | one import and one line mounting the proxy at `/search` (behind the administrator role and CSRF checks) |
| `backend/src/api/search/index.ts` | `/api/search` asks the service instead of the n8n workflow, then reads the lots (same fields as `/api/lots`) |
| `backend/src/repositories/lotsRepository.ts` | `findLotsByIds` — lots in search order, with their sale and whether it is still open |
| `backend/src/config/env.ts`, `backend/.env.example` | `TAXONOMY_SERVICE_URL` (default `http://127.0.0.1:8000`) and `TAXONOMY_SERVICE_TOKEN`; the n8n search settings removed (`backend/.env` may still hold the old values; they are no longer read) |
| `src/app/router.tsx`, `src/app/paths.ts`, `src/app/loaders.ts` | route `/admin/search` with an administrator-only loader; the search loader passes `?mode=` |
| `src/features/admin/AdminLayout.tsx` | "Search" in the administration bar |
| `src/features/search/searchService.ts` | re-exports `taxonomy_search/web/siteSearch.ts` |
| `src/pages/SearchPage.tsx` | renders `taxonomy_search/web/SearchResults.tsx` (the old `SearchPage.css` was removed) |
| `tsconfig.app.json`, `vitest.config.ts` | include `taxonomy_search/web` in type checks and unit tests |
| `package.json`, `.claude/launch.json` | `npm run taxonomy` and the `taxonomy` preview entry (and the `web` entry's port corrected to 3001) |
| `backend/test/taxonomySearch.test.ts` | **new** — site search and admin proxy against a stand-in service |
| `e2e/management.spec.ts` | the admin bar now lists Search; customers are kept out of `/admin/search` and `/api/admin/search/*` |
| `SPEC.md` | Lot Search feature, Search administration, technology row |

The switch of the whole site to `events_monitor_db` (schema `sourcing_agent`, auctions and lots read from
`drouot_collector`) is a separate change; see `AUCTION_MONITOR.md` and `SPEC.md`.

## The service's API

All endpoints except `GET /api/health` need `X-Service-Token`; the admin endpoints refuse to run without a configured
token. The service listens on 127.0.0.1 only. The Node proxy path is the same path under `/api/admin/search`
(e.g. `GET /api/admin/search/status` → `GET /api/admin/status`).

| Service endpoint | Purpose |
|---|---|
| `POST /api/search` | site search (`mode` omitted → the administrators' default); adds `labels` for display |
| `POST /api/search/expand` | expansion plan and search criteria (Search tools → keywords) |
| `GET /api/admin/status`, `GET/PUT /api/admin/settings` | status; default mode and external request limit (`.cache/settings.json`) |
| `GET /api/admin/jobs/commands`, `GET/POST /api/admin/jobs`, `GET /api/admin/jobs/{id}`, `POST …/cancel` | jobs: whitelisted CLI commands only, one at a time, logs in `.cache/jobs/` (`api/jobs.py`) |
| `GET /api/admin/taxonomy/candidates`, `GET …/concepts/{key}`, `POST …/decisions`, `POST …/import`, `GET …/export.csv`, `POST …/publish/check` | review (decisions and imports take `dryRun`); publishing is the `publish-taxonomy` job |
| `POST /api/admin/tools/search`, `POST /api/admin/tools/external` | tests that are not written to the search logs |
| `GET /api/admin/reports`, `GET /api/admin/reports/{name}`, `GET /api/admin/benchmark`, `GET /api/admin/search-log` | quality |

## Changes compared with the original project

`src/auction_search/api/admin.py` and `api/jobs.py` (new), `api/main.py` (token check, admin router, default mode,
labels), `config.py` (`TAXONOMY_SERVICE_TOKEN`, paths anchored to this folder so the service and its jobs work from
any working directory), `cli.py` (uses that project folder), `taxonomy/review.py` (`Reviewer.apply_rows`, used by the
CSV import and the admin page), `tests/test_admin_api.py` (new), `tests/test_search_db.py` (builds its app without
the token), `.env.example`, and the `web/` folder.

## Tests

```bash
cd taxonomy_search && .venv/bin/python -m pytest
```

```bash
npm test
```

## Removing the integration

Revert the hook files listed above (the old search route called the n8n workflow; it is in Git history), remove the
`taxonomy` script and launch entry, and delete this folder. The taxonomy tables in `events_monitor_db.auction_search`
are not used by anything else in the site.
