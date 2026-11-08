# Drouot n8n workflow analysis (Phase 1)

Source: `minauctiondetails.json` supplied with the request. It contains 20 nodes connected in one linear path, with no branches. This document describes what the workflow actually does; the broader repository specifications describe a different, AI-assisted EventsMonitor product. This collector follows the requested standalone, no-AI scope.

## Current behavior

The manual trigger fetches `https://drouot.com/fr/auctions/future`, extracts `a[href*='/v/']`, removes query strings, accepts numeric IDs matching `/v/(\d+)`, deduplicates by ID, and takes the first two. It throws unless exactly two exist. It builds `/fr/v/{id}{slug}` and `/en/v/{id}{slug}` URLs.

A live listing check on 31 October 2026 found `/es/v/` links in the French page; the new collector accepts language-prefixed links and rewrites them to canonical French/English paths.

For each French auction page it requires the **first** `<script type="application/ld+json">` to be a JSON object with `@type: Event`. It extracts name, description, startDate and organizer name. A regex over links finds the highest `page=` value, treating it as the page count (minimum 1, maximum 100). The English page is fetched and must contain the same JSON-LD shape; name and description become English fields. `auction_date` is formatted from `starts_at` in the Europe/Paris time zone.

The workflow constructs all catalogue URLs from page 1 through that maximum. Page 1 is fetched **again**, although its HTML was already downloaded. Each page uses `a[href*='/l/']`; numeric lot IDs are deduplicated within each auction. It throws if an auction has no lots. French and English lot pages are fetched. `h1` supplies title and a leading numeric lot number separated by `-` or `–`; `section p.whitespace-pre-line.text-paragraph-200` supplies description, falling back to Product JSON-LD description. Product JSON-LD also supplies category, `offers.priceCurrency`, and image. Missing English text is not translated.

All auction and lot rows are retained until the end. It refuses output unless two auctions and at least one lot exist, and every lot has an auction association plus nonempty French and English titles and descriptions. It then writes quoted, CRLF CSVs to `/home/node/.n8n/auctions.csv` and `/home/node/.n8n/lots.csv`.

Auction columns: `auction_id,title_fr,description_fr,title_en,description_en,starts_at,auction_date,auction_house,catalogue_page_count,auction_url_fr,auction_url_en`.

Lot columns: `auction_id,lot_id,lot_number,title_fr,description_fr,title_en,description_en,category_fr,category_en,currency,image_url,lot_url_fr,lot_url_en`.

HTTP nodes retry up to three times, waiting 10 seconds between tries. Catalogue and lot HTTP nodes specify batches of two at 2-second intervals. Listing and auction HTTP nodes have no batching. There is no explicit timeout, response-size limit, checkpoint or durable retry record.

## Node mapping

| n8n ID and node | Node.js equivalent |
| --- | --- |
| mad-01 Manual trigger | Authenticated `POST /api/collections`, persisted queued run |
| mad-02 Fetch French upcoming auctions | Drouot discovery through bounded HTTP client |
| mad-03 Extract listed auction links | Cheerio discovery selector |
| mad-04 Select next two auctions | URL validation, ID deduplication, configurable `maxAuctions` |
| mad-05 Fetch French auction | Drouot auction fetch |
| mad-06 Prepare French auction and pages | Auction parser and pagination parser |
| mad-07 Fetch English auction | Drouot auction fetch with `en` URL |
| mad-08 Prepare bilingual auctions | Auction merger and date normalization |
| mad-09 Prepare all catalogue pages | Bounded page iterator |
| mad-10 Fetch French catalogue page | HTTP client, reusing first page |
| mad-11 Extract catalogue lot links | Cheerio lot-link parser |
| mad-12 Prepare unique lot links | Lot ID validation and per-auction deduplication |
| mad-13 Fetch French lot | Drouot lot fetch |
| mad-14 Extract French lot text | Cheerio selectors and JSON-LD |
| mad-15 Prepare French lots | Lot parser and field normalization |
| mad-16 Fetch English lot | Drouot lot fetch with `en` URL |
| mad-17 Extract English lot text | Cheerio selectors and JSON-LD |
| mad-18 Prepare bilingual lots | Language merge, missing-field status |
| mad-19 Build both CSVs | Keyset-paged CSV export from committed rows |
| mad-20 Write CSV files | Streaming HTTP CSV endpoints |

## Risks and implementation plan

The two-auction cap and single listing page omit later auctions. Highest visible page number may not be the final page. The first JSON-LD script may be unrelated, a graph, or malformed. Slugs, selectors and language availability can change. The code assumes items preserve array order across n8n nodes. Entire catalogues and CSV buffers remain in memory, and any failed lot discards the export. Re-fetching catalogue page 1 duplicates traffic. There is no resume state, source boundary, or host validation.

Phases 2–10 implement: Express and configuration; source-bound discovery; bilingual parsers; catalogue traversal; lot extraction; isolated PostgreSQL storage and CSV; durable checkpoints and retry; fixture tests and available live verification; operating documentation. A source adapter owns Drouot URLs and selectors while the HTTP client, job runner, repositories and CSV export remain generic. Missing source fields stay null with explicit status. The repository has no `SPEC.md`, `DESIGN.md`, application code, or Git checkout; the two existing CSVs are preserved. PostgreSQL was unavailable at inspection, so the migration is supplied without applying it to an existing database.
