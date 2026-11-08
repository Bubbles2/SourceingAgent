# Implementation and verification record

The supplied Drouot project brief is the implementation scope. The repository's older EventsMonitor documents describe a broader React/AI product; no application code or `SPEC.md` existed here. This implementation leaves those documents and the existing CSVs unchanged. The database migration is supplied but was not applied to the user's existing database, which was unavailable.

| Phase | Delivered and validated | Remaining limit |
| --- | --- | --- |
| 1 Workflow analysis | [Node-by-node mapping](WORKFLOW_ANALYSIS.md) of all 20 nodes, links, selectors, JSON-LD, batching, retries, CSV validation. | None for the supplied workflow. |
| 2 Application | Express API, configuration, auth, clean shutdown, separate worker option. Health and authenticated job creation tested. | Deployment process manager is operator configured. |
| 3 Discovery | Current listing HTML yielded 49 unique auctions on its first page; first two IDs were `186325` and `186669`. Links used `/es/v/`, handled by canonical URL construction. Listing pagination exposed pages 2, 3, 4 and 18; collector fills gaps up to the last visible page. | Site HTML and listing count can change. |
| 4 Auction details | French/English metadata for both IDs collected in a short background run. The run persisted two auction rows and completed after a resume. | English titles may legitimately equal French titles. |
| 5 Catalogue | Read-only scan of auction `186325` found 7 pages with 663 unique lot IDs and no duplicate IDs (100 on pages 1–6; 63 on page 7). Page 1 is reused by the collector. | Dynamic catalogue mechanisms without links cannot be proven complete by HTML parsing. |
| 6 Lot details | Live French and English pages for lot `35371883` parsed as lot 1, with distinct descriptions, categories, EUR currency and image URL. Fixture tests cover missing/invalid metadata and auction association. | Full lot-detail collection was deliberately not run. |
| 7 Storage and CSV | Isolated `drouot_collector` PostgreSQL schema, incremental auction/page/lot upserts, automatic CSV files after each run, and streamed compatible CSV endpoints. Migration and integration test passed in a temporary database. | The existing `events_monitor_db` was connected and migrated after initial verification. |
| 8 Reliability | Host validation, redirect checks, timeouts, maximum response bytes, bounded two-lot concurrency, delays, retries, job leases, heartbeat and checkpoints. Integration test confirmed an expired lease can be claimed again. | No multi-hour interruption or load test was run. |
| 9 Testing | Eight local tests passed after adding automatic exports; the separate PostgreSQL integration test passed earlier in a temporary database. A live metadata-only job accepted with HTTP 202, processed two auctions, and resumed to `completed`; a seven-page link scan verified 663 unique IDs. | No 30-auction run, full-lot persistence benchmark, or source-to-database comparison at scale. |
| 10 Handover | [README](../README.md), `.env.example`, migration, API examples, run/stop/resume/export/test instructions. | Production credentials, process manager and source permission review remain operator tasks. |

## Live verification notes

Observed on 31 October 2026 (Europe/Paris). Live Drouot pages and rules may change. The first metadata run was initially marked `partial` due to a discovery page-limit condition; the condition was corrected, and resuming the same run produced `completed` without refetching the completed auction pages. The earlier local integration test left a queued job in its temporary database; that job was stopped and the test now finalizes its runs. Neither incident touched the user's existing database.

The sampled lot was `35371883` in auction `186325`: French title `Tastevin en argent. Poinçon Minerve.`, English title `Silver tastevin. Minerva hallmark.` The seven-page scan made seven requests and found zero duplicate lot IDs. These are spot checks, not a claim that all future auctions will use identical HTML.

## Source and library references

- [Drouot upcoming auctions](https://drouot.com/fr/auctions/future), [terms](https://drouot.com/en/cgu), [robots.txt](https://drouot.com/robots.txt)
- [Node.js supported releases](https://nodejs.org/en/about/previous-releases), [test runner](https://nodejs.org/api/test.html)
- [Express 5 API](https://expressjs.com/en/5x/api/), [Cheerio documentation](https://cheerio.js.org/docs/intro/), [node-postgres parameterized queries](https://node-postgres.com/features/queries)
