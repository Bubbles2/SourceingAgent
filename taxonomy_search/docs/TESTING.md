# Testing

## Running the tests

```bash
.venv/bin/python -m pytest
```

```bash
.venv/bin/python -m pytest -m "not integration"
```

Integration tests (marker `integration`, plus two CLI tests that use the database fixture) use the
database configured in the environment/`.env`. If it cannot be reached they are **skipped**, not
failed, so the unit tests still run anywhere.

What the tests do to PostgreSQL:

- Phase 1 tests only read, through read-only sessions.
- Sandbox tests (Phases 2, 3 and 10) apply all migrations (`0001`–`0003`) to a temporary schema
  `auction_search_pytest` **inside one transaction that is rolled back** at the end of the module;
  each test also runs in its own savepoint. Nothing persists. After every run,
  `select count(*) from pg_namespace where nspname like 'auction_search_%'` returned 0.
- Search tests (Phases 4–8, `test_search_db.py`) read the real `auction_search` tables built by
  `classify-lots` and `build-search-index` (skipped if those have not been run) through read-only
  sessions, with query logging off: they write nothing.
- `drouot_collector` is never written by any test (20,923 lots before and after every run).

## Test suite

| File | Tests | Kind | What it checks |
|---|---|---|---|
| `tests/test_config.py` | 10 | unit | Defaults match the project database; empty credentials fall back to libpq; the password never appears in URLs, descriptions or `repr`; unsafe schema names are rejected. |
| `tests/test_language.py` | 12 | unit | French/English/German detection; short or name-only text → `unknown`; ties → `unknown`. |
| `tests/test_inspection_rules.py` | 25 | unit | Column role/language inference for 21 real column names; auction/lot table detection with and without FK evidence; source mapping by language. |
| `tests/test_cli.py` | 35 | unit + 2 DB | `--help` for the main parser and **all 25 commands**; invalid arguments → exit 2; unknown `--lot-table` → exit 2; `validate-taxonomy` offline OK / broken seed → exit 4 / missing file → exit 2; `load-taxonomy` on an unmigrated schema → exit 5. |
| `tests/test_live_database.py` | 4 | integration | Session is read-only; real auction/lot tables, join columns and FR/EN columns are identified; profiling on 500 lots; the CLI writes all seven Phase 1 report files. |
| `tests/test_normalization.py` | 11 | unit | Case, accents, ligatures (œ, ß), apostrophes, dashes. |
| `tests/test_vocabulary.py` | 4 | unit | Migration `0001` holds exactly the values in `vocabulary.py`; period/style never hierarchical; `dated_to` only periods, `in_style_of` only styles. |
| `tests/test_seed.py` | 23 | unit | Example seed has 0 errors and 0 warnings and maps all 105 Drouot categories; worked examples present; 10 kinds of validation error; cycles; symmetric duplicates; mapping rules; ambiguous terms; orphan warnings; 6 malformed-file cases. |
| `tests/test_migrations.py` | 4 | unit | Offline SQL creates only `auction_search` objects and contains no DROP/TRUNCATE/DELETE or `drouot_collector`; migrations refuse `drouot_collector`, `drouot_collector_py` and `public`. |
| `tests/test_taxonomy_db.py` | 9 | integration (sandbox) | Lookup tables equal the vocabulary; **ORM models match the migrated schema** (Alembic autogenerate finds no difference, incl. the `0002`/`0003` tables, tsvector and pgvector columns); seed load is idempotent; a changed preferred label is kept as a synonym; **all 28 validation scenarios pass**; no foreign key leaves the schema; one published version; downgrade refuses without permission and works with it. |
| `tests/test_extraction.py` | 18 | unit | Lemmas, roman numerals, names; gazetteer plural and longest match, shared ambiguous term; artist headers (incl. "SURNAME, Firstname", sentence breaks, rulers rejected); brand headers; "époque X", centuries, styles (quotes, junk rejected, CJK rejected); attributions; object heads and compounds; materials (and "en l'état"/"en bleu" rejected); lexicons; a whole lot incl. a German field skipped. |
| `tests/test_builder.py` | 2 | unit | Thresholds, existing-concept matches, cross-dimension conflicts, maker names not object types, single-auction headings dropped, English by alignment, parent from Drouot category but never from a culture department, style→period link, evidence caps; aligner prefers "snuff bottle" over "snuff" and ignores one-catalogue boilerplate. |
| `tests/test_candidates_db.py` | 4 | integration (sandbox + read-only source) | Extraction job: 120 lots, second run 120 cache hits, interrupted run resumed from the right lot with identical output. Import: thresholds, idempotent re-import (no duplicate evidence). Review: approve/reject cascades, CSV export → decision + corrected label → apply, a review file saved by French Excel (semicolons, Windows-1252, "oui"/"non") is read correctly, publication blocked by a missing English label, published views show only approved rows. |
| `tests/test_classification.py` | 6 | unit | **[P4]** "d'époque Louis XIV" → `dated_to` period, "de style Louis XIV" → `in_style_of` style; Drouot category + title/lead/note positions and confidences; "attribué à / atelier de / d'après" → the right maker assertion; complements ("cadre à bijoux"), packaging and gold-plated are not the lot's object/material; ambiguous terms alone do not classify; review reasons. |
| `tests/test_search_units.py` | 11 | unit | **[P7–8]** Query understanding (core names, period vs style intent); the brief's "Louis XIV furniture" expansion (FR/EN terms, priorities, combined phrases); exact/broad/exploratory depths, de-duplication, limits, cache, ambiguous terms not expanded; rate limiter and retry with back-off; mock provider pagination, OR queries and injected failures; orchestrator validation (direct vs related), cross-provider de-duplication and source attribution; sub-types listed nearest first (an alphabetical cut used to drop "Tables"); **search criteria**: ideas, core names, covered keywords, depth rules, optional regions, AND/OR string; boolean syntax round trip and splitting under a length limit; requests per provider capability (AND/OR, OR only, plain phrases); an AND request to the mock API returns none of the 6 fictitious non-furniture Louis XIV lots and finds the armchair via a sub-type word. |
| `tests/test_search_db.py` | 5 | integration (read-only) | **[P4–8]** On the real classified data: "commode d'époque Louis XIV" (exact) finds period lots 6928 and 6933, each explained by the taxonomy; "Louis XIV style" finds the 19th-century lot 7059 but not the period lot 6928; "Find auctions selling shoes" finds ≥ 20 footwear lots where keyword search on the raw sentence finds none; exact mode returns no related suggestions; every lot has a classification state and no `dated_to`/`in_style_of` is on the wrong dimension; HTTP API (FastAPI `TestClient`): health, expand ("Mobilier Louis XIV", "Louis Quatorze furniture"), search, external (mock lots M006/M007), invalid mode → 422, unknown provider → 400 (skipped if FastAPI is not installed). |
| `tests/test_evaluation_improvement.py` | 4 | unit + 1 sandbox | **[P9–10]** Metrics (P@10, R@50, nDCG@10, MRR) on known lists; rule labels and **human labels overriding rules**; benchmark file well-formed (20 queries, FR and EN); improvement in a sandbox: unreviewed candidates excluded from the draft snapshot, search demand recorded on the matching candidate, a co-occurrence relationship proposed as `candidate`/`search_feedback` (never approved), affected lots found. |
| **Total** | **187** | | |

## Phase 2 validation scenarios

`validate-taxonomy --sandbox` and `test_all_validation_scenarios_pass` run the same 28 scenarios
(`taxonomy/scenarios.py`); results are in `reports/taxonomy_validation.md`:

| Group | Scenarios | Examples |
|---|---|---|
| Synonyms and translations | 5 | "Bottines"/"Ankle boots" = one concept; "Louis Quatorze style" is a synonym; "Buhl work" is a spelling variant; "HERMES" finds "Hermès"; fr "chandeliers" ≠ en "chandeliers" |
| Parent–child hierarchy | 3 | footwear → 7 subtypes; ankle boots → boots → footwear → fashion; 18th century excludes Louis XIV |
| Historical associations | 5 | Louis XIV period ≠ style; only `originated_in_period` links them; Boulle marquetry is associated, not synonymous; bare "Boulle" ambiguous; Napoleon III `revival_of` Louis XIV |
| Real lots | 3 | lot 7059 (style Louis XIV, 19th c.) vs lot 6928 (d'époque Louis XIV) return separately; `dated_to` a style is rejected |
| Constraint rejections | 9 | broader style→period; lying dimension; self-link; non-canonical `related`; duplicate key; second preferred label; reused preferred label; evidence with two targets; confidence 1.5 |
| Versions | 3 | nothing visible while draft; visible after approve + publish; two published versions rejected |

## Results (2026-11-08, Python 3.14.8, PostgreSQL 18.4)

| Run | Result |
|---|---|
| `.venv/bin/python -m pytest` (database reachable) | **187 passed** in ≈ 6 s |
| `.venv/bin/python -m pytest -m "not integration"` | 164 passed, 23 deselected |
| `DB_PORT=1 .venv/bin/python -m pytest` (database unreachable) | 162 passed, **25 skipped** |
| `validate-taxonomy --sandbox` | 0 errors, 28/28 scenarios passed, sandbox left behind: no |
| `serve-api` live (uvicorn on port 8765, `--no-semantic`) | `/api/health`, `/api/search/expand`, `/api/search` answered; "commode Louis XIV" exact → lots 6928, 6933 in 13 ms |
| `run-regression` | PASS (all metrics within 0.05 of the baseline; 4 invariants hold) |
| Leftover `auction_search_*` sandbox schemas after all runs | 0 |

Bugs the tests found during Phase 2 (fixed): the drift test first reported 14 differences, all
caused by the test copying the models without their naming convention; one scenario expected only
`named_after` between Boulle marquetry and A.-C. Boulle although the seed also (correctly)
records `associated_technique`.

Bugs found during Phase 3 (fixed): a lone opening quote («␣famille rose ») ended a style phrase
before it started; `dataclasses.asdict` corrupted a `Counter` in the import result; the aligner's
choice between "snuff" and "snuff bottle" depended on iteration order (now deterministic — two
builds compared identical). Two builder tests first failed because the synthetic data had no
background text; real catalogues always do, and the tests now include it.

Bugs found in Phases 4–10 (fixed): unreviewed extracted candidates (e.g. junk object heads) were
classifying lots → the draft snapshot now uses only curated and approved rows; "cadre à bijoux",
jewellery boxes and gold-plated metal produced wrong objects/materials → complement, packaging
and plating cues; "goût Louis XIV, XIXe siècle" let the style cue cross a comma → clause breaks;
category/text disagreement was over-counted for culture departments → title first, culture
departments excluded; the ORM drift test found a nullability mismatch on the tsvector columns;
"French" and vague words made broad search require every word → soft groups; an evaluation
helper put sets into a set (caught before the first run); the single word "art" matched a junk
candidate in Phase 10 → phrases are matched first.

## Phase 3 quality checks on real data

Not automated tests but recorded results (see `reports/taxonomy_extraction.md` §5):
Louis XIV period and style retrieve different lots (5 vs 7, none both); 9 of the 12 *Chaussures*
lots carry an unambiguous footwear term (the others are spurs and clogs); ambiguous terms produce
the expected false attestations ("heels" in 43 *Arms* lots, "pumps" in car/bicycle lots).

## Search evaluation (Phase 9)

Command: `evaluate-search` (report `reports/search_evaluation.md`; JSON alongside).

**Dataset.** `data/benchmark/queries.yaml` — 20 queries (8 English sentences from the brief, 12
short French/English queries: footwear, Louis XIV period, Boulle, handbags, rings, watches, rugs,
icons, coins, Art Deco, bronze, Napoleon III, silver, stamps, Hermès scarves). Each query has a
**provisional relevance rule** (Drouot categories and/or regular expressions on the French text),
written before the systems were run. Rules are not ground truth: they are cheap, explicit and
reproducible, but they favour systems that also use Drouot categories (the taxonomy channel does).

**Human labels.** `data/benchmark/human_labels.csv` (columns `query_id, lot_id, relevant`) overrides
the rule for any (query, lot) pair it contains. `evaluate-search` writes a judgement pool —
`data/benchmark/judgements_to_review.csv`, the top 10 of every system for every query (600 rows,
with the rule's verdict) — for a person to fill in. **Human labels applied so far: 0.** No
AI-generated label is used.

**Systems compared.** `keyword_raw` (PostgreSQL FTS on the whole sentence), `keyword_content`
(FTS on content words only), `semantic_only` (pgvector), `taxonomy_only` (lot assertions),
`hybrid_exact`, `hybrid_broad`.

**Metrics.** precision@10, recall@50 (relevant set capped at 50), nDCG@10 (binary gains), MRR,
queries with no result, mean and p95 latency. Cost per query: 0 AI tokens, 0 external calls.

**Results (2026-11-08, draft taxonomy, provisional labels):**

| System | P@10 | R@50 | nDCG@10 | MRR | Mean ms |
|---|---|---|---|---|---|
| keyword_raw | 0.535 | 0.453 | 0.574 | 0.600 | 2.1 |
| keyword_content | 0.525 | 0.432 | 0.582 | 0.710 | 1.2 |
| semantic_only | 0.445 | 0.345 | 0.463 | 0.642 | 22.1 |
| taxonomy_only | 0.600 | 0.693 | 0.678 | 0.760 | 15.2 |
| hybrid_exact | 0.725 | 0.662 | 0.819 | 0.925 | 21.1 |
| hybrid_broad | **0.795** | **0.828** | **0.880** | **0.967** | 33.8 |

**Regression.** `evaluate-search --save-baseline` stores these metrics in
`data/benchmark/baseline_metrics.json`; `run-regression` re-runs the benchmark and fails (exit 6)
if hybrid P@10, R@50 or nDCG@10 drop by more than `--tolerance` (0.05), if a query loses all its
results, or if an invariant breaks: `dated_to` only on periods and `in_style_of` only on styles;
published views show only approved rows; no classification uses a rejected concept; an external
search does not change the taxonomy tables.
