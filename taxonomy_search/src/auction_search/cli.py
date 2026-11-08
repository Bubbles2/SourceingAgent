"""Command-line entry point: ``python -m auction_search.cli <command> [options]``.

Phase 1 commands (all read-only — they never write to the database):

* ``check-db``      — verify the connection and show the server, user and read-only status.
* ``inspect-db``    — inspect schema structure; writes ``database_structure.{md,json}`` and
                      ``source_mapping.json``.
* ``analyze-lots``  — profile auction/lot data quality; writes ``data_quality.{md,json}`` and
                      ``lot_samples.{md,json}``.

Phase 2 commands (taxonomy):

* ``validate-taxonomy`` — validate a seed file offline; with ``--sandbox`` also migrate, load and
                          run the validation scenarios in a rolled-back transaction.
* ``load-taxonomy``     — load a seed into ``auction_search`` (requires ``alembic upgrade head``);
                          ``--dry-run`` rolls back.
* ``show-concept``      — print a concept with its terms, relationships and hierarchy.

Phase 3 commands (taxonomy from lot data, rules only — no AI):

* ``extract-terms``     — read lots in batches, extract mentions (cache by content hash, ``--resume``).
* ``build-candidates``  — group, filter, translate and link candidates; writes the extraction report.
* ``import-candidates`` — store candidates + evidence in a draft version (``--dry-run`` rolls back).
* ``build-taxonomy``    — the three steps above in one go.
* ``review-taxonomy``   — ``list`` / ``export`` / ``apply`` / ``approve`` / ``reject`` candidates.
* ``publish-taxonomy``  — publish a reviewed draft version (checks first).

Every command supports ``--help``. Exit codes: 0 success, 1 database/connection error,
2 invalid arguments, 3 auction/lot tables could not be identified, 4 taxonomy validation failed,
5 the ``auction_search`` schema has not been migrated yet.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError

from auction_search.config import PROJECT_ROOT, Settings, get_settings, validate_identifier
from auction_search.database.connection import check_connection, create_readonly_engine
from auction_search.logging_config import configure_logging

log = logging.getLogger("auction_search.cli")

EXIT_OK, EXIT_DB_ERROR, EXIT_USAGE, EXIT_NOT_IDENTIFIED = 0, 1, 2, 3
EXIT_INVALID_TAXONOMY, EXIT_NOT_MIGRATED = 4, 5

DEFAULT_SEED = PROJECT_ROOT / "data" / "taxonomy" / "example_taxonomy.yaml"
DEFAULT_CACHE = PROJECT_ROOT / ".cache" / "extraction"


def _positive_int(value: str) -> int:
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return n


def _non_negative_int(value: str) -> int:
    n = int(value)
    if n < 0:
        raise argparse.ArgumentTypeError("must be zero or a positive integer")
    return n


def _identifier(value: str) -> str:
    try:
        return validate_identifier(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="auction-search",
        description="Taxonomy-driven auction search. Phase 1: read-only database inspection.",
    )
    parser.add_argument("--log-level", default=None, help="DEBUG, INFO, WARNING, ERROR (default: LOG_LEVEL or INFO)")
    parser.add_argument("--log-format", choices=("text", "json"), default=None,
                        help="log line format on stderr (default: LOG_FORMAT or text)")
    sub = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--schema", type=_identifier, default=None,
                       help="source schema to inspect (default: DB_SCHEMA, i.e. drouot_collector)")
        p.add_argument("--output-dir", type=Path, default=None,
                       help="directory for report files (default: REPORTS_DIR, i.e. ./reports)")

    def table_overrides(p: argparse.ArgumentParser) -> None:
        p.add_argument("--auction-table", type=_identifier, default=None,
                       help="override the detected auction table name")
        p.add_argument("--lot-table", type=_identifier, default=None, help="override the detected lot table name")

    p_check = sub.add_parser("check-db", help="check the PostgreSQL connection (read-only)",
                             description="Connect to PostgreSQL and report server version, user and read-only mode.")
    p_check.set_defaults(func=cmd_check_db)

    p_inspect = sub.add_parser(
        "inspect-db", help="inspect the source schema structure (read-only)",
        description="Discover tables, columns, keys, indexes and relationships in the source schema, "
                    "identify the auction and lot tables, and write database_structure.md/.json and "
                    "source_mapping.json.",
    )
    common(p_inspect)
    table_overrides(p_inspect)
    p_inspect.add_argument("--estimate-counts", action="store_true",
                           help="use planner row estimates instead of exact count(*) (faster on huge tables)")
    p_inspect.set_defaults(func=cmd_inspect_db)

    p_analyze = sub.add_parser(
        "analyze-lots", help="profile auction and lot data quality (read-only)",
        description="Profile nulls, duplicates, text lengths, languages and categories of the auction and lot "
                    "data, and write data_quality.md/.json and lot_samples.md/.json.",
    )
    common(p_analyze)
    table_overrides(p_analyze)
    p_analyze.add_argument("--limit", type=_positive_int, default=None,
                           help="only analyse the first N lots by primary key (for quick tests)")
    p_analyze.add_argument("--language-sample", type=_non_negative_int, default=0,
                           help="lots sampled for content language detection; 0 = all lots (default: 0)")
    p_analyze.add_argument("--samples-per-category", type=_positive_int, default=3,
                           help="representative lots per category (default: 3)")
    p_analyze.add_argument("--max-categories", type=_positive_int, default=40,
                           help="number of largest categories to sample (default: 40)")
    p_analyze.set_defaults(func=cmd_analyze_lots)

    # ---- Phase 2: taxonomy ----------------------------------------------------------
    def seed_arg(p: argparse.ArgumentParser) -> None:
        p.add_argument("--seed", type=Path, default=DEFAULT_SEED,
                       help="taxonomy seed YAML (default: data/taxonomy/example_taxonomy.yaml)")

    p_validate = sub.add_parser(
        "validate-taxonomy", help="validate a taxonomy seed (offline; --sandbox adds a rolled-back DB test)",
        description="Validate a seed file without a database. With --sandbox, also apply the migrations to a "
                    "temporary schema inside one transaction, load the seed, run the Phase 2 validation scenarios "
                    "and roll everything back. Writes taxonomy_validation.md/.json.",
    )
    seed_arg(p_validate)
    p_validate.add_argument("--sandbox", action="store_true",
                            help="also test against PostgreSQL in a rolled-back transaction")
    p_validate.add_argument("--sandbox-schema", type=_identifier, default="auction_search_sandbox",
                            help="temporary schema name used inside the transaction (default: auction_search_sandbox)")
    p_validate.add_argument("--output-dir", type=Path, default=None, help="directory for report files")
    p_validate.set_defaults(func=cmd_validate_taxonomy)

    p_load = sub.add_parser(
        "load-taxonomy", help="load a seed into the auction_search schema (writes; needs migrations)",
        description="Upsert a validated seed into APP_SCHEMA (auction_search) as a draft taxonomy version. "
                    "Requires `alembic upgrade head` first. Never touches drouot_collector.",
    )
    seed_arg(p_load)
    p_load.add_argument("--approve", action="store_true",
                        help="mark loaded rows as approved (default: candidate, pending review)")
    p_load.add_argument("--dry-run", action="store_true", help="do everything, then roll back")
    p_load.add_argument("--created-by", default=None, help="name recorded on a newly created version")
    p_load.set_defaults(func=cmd_load_taxonomy)

    p_show = sub.add_parser("show-concept", help="show a concept's terms, relationships and hierarchy",
                            description="Print one concept from the taxonomy tables.")
    p_show.add_argument("key", help="concept key, e.g. style.louis_xiv")
    p_show.add_argument("--sandbox", action="store_true",
                        help="load the seed into a rolled-back sandbox first (works before migrations are applied)")
    seed_arg(p_show)
    p_show.set_defaults(func=cmd_show_concept)

    # ---- Phase 3: taxonomy from lot data ------------------------------------------
    def cache_arg(p: argparse.ArgumentParser) -> None:
        p.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE,
                       help="where extraction results are cached (default: .cache/extraction)")

    def extract_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--limit", type=_positive_int, default=None, help="only process the first N lots by id")
        p.add_argument("--batch-size", type=_positive_int, default=500, help="lots read per query (default: 500)")
        p.add_argument("--resume", action="store_true", help="continue an interrupted run")
        p.add_argument("--refresh", action="store_true", help="ignore cached results and re-extract every lot")

    def build_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--min-lots", type=_positive_int, default=3,
                       help="minimum number of lots for a candidate (default: 3)")
        p.add_argument("--output-dir", type=Path, default=None, help="directory for report files")

    def import_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--version", dest="version_label", default="0.2.0",
                       help="draft taxonomy version receiving the candidates (default: 0.2.0)")
        p.add_argument("--min-confidence", type=float, default=0.4,
                       help="only import candidates at or above this confidence (default: 0.4)")
        p.add_argument("--dry-run", action="store_true", help="import, report, then roll back")

    p_extract = sub.add_parser("extract-terms", help="extract candidate terms and evidence from lots (rules only)",
                               description="Read lots in batches and run the rule-based extractors. Results are "
                                           "cached per lot by content hash in --cache-dir; --resume continues an "
                                           "interrupted run. Read-only on the database.")
    cache_arg(p_extract)
    extract_args(p_extract)
    p_extract.set_defaults(func=cmd_extract_terms)

    p_build = sub.add_parser("build-candidates", help="turn extracted mentions into taxonomy candidates",
                             description="Group, filter, translate (French↔English alignment) and link candidates; "
                                         "write candidates.json and reports/taxonomy_extraction.md/.json.")
    cache_arg(p_build)
    build_args(p_build)
    p_build.set_defaults(func=cmd_build_candidates)

    p_import = sub.add_parser("import-candidates", help="store candidates and evidence in auction_search",
                              description="Insert candidates as 'candidate' rows of a draft version, with evidence "
                                          "lots. Reviewed rows are never overwritten.")
    cache_arg(p_import)
    import_args(p_import)
    p_import.add_argument("--output-dir", type=Path, default=None, help="directory for report files")
    p_import.set_defaults(func=cmd_import_candidates)

    p_bt = sub.add_parser("build-taxonomy", help="extract-terms + build-candidates + import-candidates",
                          description="Run the whole Phase 3 pipeline.")
    cache_arg(p_bt)
    extract_args(p_bt)
    build_args(p_bt)
    import_args(p_bt)
    p_bt.set_defaults(func=cmd_build_taxonomy)

    p_review = sub.add_parser("review-taxonomy", help="list, export, apply, approve or reject candidates",
                              description="Human review of taxonomy candidates.")
    rsub = p_review.add_subparsers(dest="review_command", required=True, metavar="ACTION")
    for name, help_ in (("list", "print candidates"), ("export", "write candidates to a CSV for review")):
        rp = rsub.add_parser(name, help=help_)
        rp.add_argument("--status", default="candidate", help="candidate | approved | rejected | all")
        rp.add_argument("--dimension", default=None)
        rp.add_argument("--provenance", default=None, help="e.g. rule_extraction or seed")
        rp.add_argument("--version", dest="version_label", default=None)
        rp.add_argument("--min-confidence", type=float, default=None)
        rp.add_argument("--limit", type=_positive_int, default=None if name == "export" else 50)
        if name == "export":
            rp.add_argument("output", type=Path, help="CSV file to write")
            rp.add_argument("--delimiter", choices=(",", ";"), default=",",
                            help="column separator; use ';' for Excel with French regional settings (default: ,)")
    rp = rsub.add_parser("apply", help="apply decisions from a reviewed CSV")
    rp.add_argument("input", type=Path, help="CSV with a 'decision' column (approve / reject)")
    rp.add_argument("--dry-run", action="store_true", help="show the effect, then roll back")
    for name in ("approve", "reject"):
        rp = rsub.add_parser(name, help=f"{name} concepts by key")
        rp.add_argument("keys", nargs="+")
        rp.add_argument("--dry-run", action="store_true", help="show the effect, then roll back")
    p_review.set_defaults(func=cmd_review_taxonomy)

    p_pub = sub.add_parser("publish-taxonomy", help="publish a reviewed draft version",
                           description="Check a draft version and publish it (retiring the published one). Only "
                                       "approved rows become visible through the published_* views.")
    p_pub.add_argument("version_label", metavar="VERSION")
    p_pub.add_argument("--dry-run", action="store_true", help="run the checks only")
    p_pub.set_defaults(func=cmd_publish_taxonomy)

    # ---- Phase 4: classification ------------------------------------------------------
    def scope_arg(p: argparse.ArgumentParser) -> None:
        p.add_argument("--scope", choices=("auto", "draft", "published"), default="auto",
                       help="taxonomy used: published version, or the unpublished draft (default: auto = published "
                            "if one exists, else draft)")

    p_cls = sub.add_parser("classify-lots", help="link lots to taxonomy concepts (rules only)",
                           description="Classify lots into auction_search.lot_concepts. Incremental: only lots whose "
                                       "text, taxonomy or classifier changed are reclassified. Each batch is committed, "
                                       "so an interrupted run continues on the next call.")
    scope_arg(p_cls)
    p_cls.add_argument("--limit", type=_positive_int, default=None, help="only look at the first N lots by id")
    p_cls.add_argument("--batch-size", type=_positive_int, default=500)
    p_cls.add_argument("--force", action="store_true", help="reclassify every lot")
    p_cls.add_argument("--resume", action="store_true", help="continue an interrupted run (the default behaviour)")
    p_cls.add_argument("--dry-run", action="store_true", help="classify and report without writing")
    p_cls.add_argument("--affected", action="store_true",
                       help="after a taxonomy change: reclassify only lots touched by changed concepts or terms")
    p_cls.add_argument("--output-dir", type=Path, default=None)
    p_cls.set_defaults(func=cmd_classify_lots)

    # ---- Phase 5: embeddings ----------------------------------------------------------
    p_bench = sub.add_parser("benchmark-embeddings", help="compare multilingual embedding models on the real lots",
                             description="Run the cross-language benchmark (English queries → French-only text) for "
                                         "each known local model; writes reports/embedding_benchmark.md. Downloads the "
                                         "models from Hugging Face on first use (≈ 470 MB each).")
    p_bench.add_argument("--sample-size", type=_positive_int, default=1000)
    p_bench.add_argument("--output-dir", type=Path, default=None)
    p_bench.set_defaults(func=cmd_benchmark_embeddings)

    p_emb = sub.add_parser("build-embeddings", help="embed lots into pgvector (incremental)",
                           description="Embed each lot's searchable text with EMBEDDING_MODEL and store it in "
                                       "auction_search.lot_embeddings. Only new or changed texts are embedded.")
    p_emb.add_argument("--model", default=None, help="override EMBEDDING_MODEL")
    p_emb.add_argument("--limit", type=_positive_int, default=None)
    p_emb.add_argument("--batch-size", type=_positive_int, default=256)
    p_emb.add_argument("--force", action="store_true", help="re-embed every lot")
    p_emb.add_argument("--resume", action="store_true", help="continue an interrupted run (the default behaviour)")
    p_emb.add_argument("--dry-run", action="store_true", help="encode without writing")
    p_emb.add_argument("--output-dir", type=Path, default=None)
    p_emb.set_defaults(func=cmd_build_embeddings)

    # ---- Phase 6: search ----------------------------------------------------------------
    p_idx = sub.add_parser("build-search-index", help="build the full-text search documents (incremental)",
                           description="Copy each lot's titles, description start, category, auction date and URL "
                                       "into auction_search.lot_search_documents with French/English tsvectors.")
    p_idx.add_argument("--limit", type=_positive_int, default=None)
    p_idx.add_argument("--batch-size", type=_positive_int, default=1000)
    p_idx.add_argument("--force", action="store_true")
    p_idx.set_defaults(func=cmd_build_search_index)

    def search_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--mode", choices=("exact", "broad", "exploratory"), default="broad")
        p.add_argument("--language", choices=("all", "fr", "en"), default="all",
                       help="languages of the expanded terms (default: all)")
        scope_arg(p)
        p.add_argument("--no-semantic", action="store_true", help="do not load the embedding model")

    p_search = sub.add_parser("search", help="hybrid search (taxonomy + keywords + semantic)",
                              description="Search the lots in natural language (French or English).")
    p_search.add_argument("query")
    search_args(p_search)
    p_search.add_argument("--limit", type=_positive_int, default=10)
    p_search.add_argument("--json", action="store_true", help="print the full response as JSON")
    p_search.set_defaults(func=cmd_search)

    p_cmp = sub.add_parser("compare-search", help="compare hybrid search with plain keyword search",
                           description="Run the example queries with hybrid search and with keyword-only search; "
                                       "write reports/search_comparison.md.")
    search_args(p_cmp)
    p_cmp.add_argument("--output-dir", type=Path, default=None)
    p_cmp.set_defaults(func=cmd_compare_search)

    p_api = sub.add_parser("serve-api", help="run the HTTP API (FastAPI + Uvicorn)",
                           description="Serve /api/search, /api/search/expand, /api/search/external, /api/health.")
    p_api.add_argument("--host", default="127.0.0.1")
    p_api.add_argument("--port", type=int, default=8000)
    p_api.add_argument("--no-semantic", action="store_true", help="do not load the embedding model")
    p_api.set_defaults(func=cmd_serve_api)

    # ---- Phase 7: query expansion ------------------------------------------------------
    p_exp = sub.add_parser("expand-query", help="expand a query with the taxonomy",
                           description="Print the structured query plan (synonyms, translations, narrower and "
                                       "related concepts with priorities) used for internal and external search. "
                                       "With --criteria: the keywords grouped by idea and ready-to-send AND/OR "
                                       "queries for any search engine or API (uses the taxonomy only, not the lots).")
    p_exp.add_argument("query")
    p_exp.add_argument("--language", choices=("all", "fr", "en"), default="all")
    p_exp.add_argument("--depth", choices=("exact", "broad", "exploratory"), default="broad")
    p_exp.add_argument("--max-queries", type=_positive_int, default=None,
                       help="phrases in the flat list (default 20); with --criteria: keywords per idea (default 40)")
    p_exp.add_argument("--criteria", action="store_true",
                       help="print the search criteria: keywords per idea, AND/OR query, combined phrases")
    scope_arg(p_exp)
    p_exp.add_argument("--json", action="store_true")
    p_exp.set_defaults(func=cmd_expand_query)

    # ---- Phase 8: external providers ---------------------------------------------------
    p_ext = sub.add_parser("search-external", help="search external auction providers with taxonomy expansions",
                           description="Turn the query into taxonomy search criteria, send them to provider adapters "
                                       "as AND/OR requests or combined phrases (mock and local database by default; "
                                       "no real external provider is configured), normalise, deduplicate, validate.")
    p_ext.add_argument("query")
    p_ext.add_argument("--providers", default=None, help="comma-separated provider names (default: all configured)")
    p_ext.add_argument("--language", choices=("all", "fr", "en"), default="all")
    p_ext.add_argument("--depth", choices=("exact", "broad", "exploratory"), default="broad")
    p_ext.add_argument("--max-queries", type=_positive_int, default=40, help="keywords per idea (default 40)")
    p_ext.add_argument("--max-requests", type=_positive_int, default=6,
                       help="requests per provider and language (default 6)")
    p_ext.add_argument("--limit", type=_positive_int, default=10)
    scope_arg(p_ext)
    p_ext.add_argument("--json", action="store_true")
    p_ext.set_defaults(func=cmd_search_external)

    # ---- Phase 9: evaluation -----------------------------------------------------------
    p_eval = sub.add_parser("evaluate-search", help="benchmark search systems on labelled queries",
                            description="Compare keyword, semantic, taxonomy and hybrid search on "
                                        "data/benchmark/queries.yaml; write reports/search_evaluation.md and the "
                                        "judgement pool data/benchmark/judgements_to_review.csv.")
    scope_arg(p_eval)
    p_eval.add_argument("--save-baseline", action="store_true",
                        help="store the metrics as data/benchmark/baseline_metrics.json (used by run-regression)")
    p_eval.add_argument("--output-dir", type=Path, default=None)
    p_eval.add_argument("--log-queries", action="store_true",
                        help="also record the benchmark queries in search_queries (replayed, not real users)")
    p_eval.set_defaults(func=cmd_evaluate_search)

    # ---- Phase 10: continuous improvement ---------------------------------------------
    p_imp = sub.add_parser("improve-taxonomy", help="propose taxonomy improvements (candidates only)",
                           description="Learn from search logs, classifications and new lots; write candidate "
                                       "proposals into a draft version for review. Never approves or publishes.")
    scope_arg(p_imp)
    p_imp.add_argument("--version", dest="version_label", default="0.3.0")
    p_imp.add_argument("--min-searches", type=_positive_int, default=1)
    p_imp.add_argument("--extract", action="store_true",
                       help="also extract new/changed lots and import their new candidates (Phase 3 pipeline)")
    p_imp.add_argument("--dry-run", action="store_true")
    p_imp.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    p_imp.add_argument("--output-dir", type=Path, default=None)
    p_imp.set_defaults(func=cmd_improve_taxonomy)

    p_reg = sub.add_parser("run-regression", help="check search quality and invariants against the baseline",
                           description="Re-run the benchmark, compare with data/benchmark/baseline_metrics.json and "
                                       "check database invariants. Exit 6 on a regression.")
    scope_arg(p_reg)
    p_reg.add_argument("--tolerance", type=float, default=0.05, help="allowed drop in P@10 / R@50 / nDCG@10")
    p_reg.add_argument("--output-dir", type=Path, default=None)
    p_reg.set_defaults(func=cmd_run_regression)

    p_main = sub.add_parser("maintain", help="incremental refresh after new lots or taxonomy changes",
                            description="build-search-index → classify-lots --affected → build-embeddings → "
                                        "run-regression, each touching only what changed.")
    scope_arg(p_main)
    p_main.add_argument("--tolerance", type=float, default=0.05)
    p_main.add_argument("--output-dir", type=Path, default=None)
    p_main.set_defaults(func=cmd_maintain)
    return parser


# --------------------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------------------


def _settings_for(args: argparse.Namespace) -> Settings:
    settings = get_settings()
    updates = {}
    if getattr(args, "schema", None):
        updates["db_schema"] = args.schema
    if getattr(args, "output_dir", None):
        updates["reports_dir"] = args.output_dir
    return settings.model_copy(update=updates) if updates else settings


def cmd_check_db(args: argparse.Namespace) -> int:
    settings = _settings_for(args)
    engine = create_readonly_engine(settings)
    info = check_connection(engine)
    print(f"Target:            {settings.describe_target()}")
    print(f"Connected as:      {info.current_user}")
    print(f"Database:          {info.database}")
    print(f"PostgreSQL:        {info.server_version}")
    print(f"Read-only session: {info.transaction_read_only}")
    return EXIT_OK


def _structure(args: argparse.Namespace, settings: Settings, exact_counts: bool):  # type: ignore[no-untyped-def]
    from auction_search.database.inspection import build_structure_report

    engine = create_readonly_engine(settings)
    check_connection(engine)
    report = build_structure_report(
        engine, settings.db_schema, settings.app_schema, settings.describe_target(),
        exact_counts=exact_counts, auction_table=args.auction_table, lot_table=args.lot_table,
    )
    return engine, report


def cmd_inspect_db(args: argparse.Namespace) -> int:
    from auction_search.database.inspection_report import render_structure_markdown
    from auction_search.reporting import human_bytes, write_report

    settings = _settings_for(args)
    _, report = _structure(args, settings, exact_counts=not args.estimate_counts)
    out_dir = settings.reports_dir
    paths = write_report(out_dir, "database_structure", report, render_structure_markdown(report))
    if report.mapping:
        paths += write_report(out_dir, "source_mapping", report.mapping)

    s = report.server
    print(f"PostgreSQL {s.version} — database {s.database} — user {s.current_user}")
    vector = s.installed_extensions.get("vector")
    print(f"pgvector: {'installed ' + vector['version'] + ' in schema ' + vector['schema'] if vector else 'not installed'}")
    print(f"Schema {report.schema}: {len(report.tables)} relations")
    for t in report.tables:
        print(f"  {t.name:<20} {t.row_count or 0:>10,} rows  {human_bytes(t.total_bytes):>9}")
    print(f"Auction table: {report.detection.auction_table}   Lot table: {report.detection.lot_table}   "
          f"FK-confirmed: {report.detection.confident}")
    for rel in report.relationships:
        print(f"  FK {rel}")
    print("Reports:")
    for p in paths:
        print(f"  {p}")
    if not report.mapping:
        log.error("auction and lot tables not identified; use --auction-table/--lot-table")
        return EXIT_NOT_IDENTIFIED
    return EXIT_OK


def cmd_analyze_lots(args: argparse.Namespace) -> int:
    from auction_search.database.data_quality import build_data_quality_report
    from auction_search.database.data_quality_report import render_data_quality_markdown, render_samples_markdown
    from auction_search.reporting import pct, write_report

    settings = _settings_for(args)
    engine, structure = _structure(args, settings, exact_counts=True)
    if structure.mapping is None:
        log.error("auction and lot tables not identified; use --auction-table/--lot-table")
        return EXIT_NOT_IDENTIFIED
    report, samples = build_data_quality_report(
        engine, structure, settings.describe_target(),
        lot_limit=args.limit, language_sample=args.language_sample,
        samples_per_category=args.samples_per_category, max_categories=args.max_categories,
    )
    out_dir = settings.reports_dir
    paths = write_report(out_dir, "data_quality", report, render_data_quality_markdown(report))
    paths += write_report(out_dir, "lot_samples", samples, render_samples_markdown(samples))

    print(f"Lots analysed: {report.lots_analysed:,}   Auctions: {report.auctions.auctions:,}   "
          f"Orphan lots: {report.orphan_lots}")
    for p in report.language_pairs:
        print(f"  {p.table}.{p.role}: FR+EN {pct(p.both, p.rows)}, FR only {p.only.get('fr')}, "
              f"EN only {p.only.get('en')}, neither {p.neither}")
    if report.categories:
        print(f"Categories: {report.categories.distinct}   uncategorised lots: {report.categories.uncategorised:,}")
    for d in report.duplicates:
        print(f"  duplicates — {d.check}: {d.groups:,} groups / {d.rows:,} rows")
    print(f"Samples: {len(samples.samples)} lots")
    print("Reports:")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


def _read_seed(path: Path):  # type: ignore[no-untyped-def]
    from auction_search.taxonomy.seed import load_seed_file, validate_seed

    seed = load_seed_file(path)
    return seed, validate_seed(seed)


def cmd_validate_taxonomy(args: argparse.Namespace) -> int:
    from datetime import datetime, timezone

    from sqlalchemy import text

    from auction_search.database.connection import create_readwrite_engine
    from auction_search.database.inspection import build_structure_report
    from auction_search.reporting import write_report
    from auction_search.taxonomy.report import TaxonomyValidationReport, render_taxonomy_markdown
    from auction_search.taxonomy.sandbox import migrated_sandbox
    from auction_search.taxonomy.scenarios import ScenarioRunner, find_example_lots
    from auction_search.taxonomy.seed import seed_statistics
    from auction_search.taxonomy.store import TaxonomyStore

    settings = _settings_for(args)
    seed, issues = _read_seed(args.seed)
    seed_path = args.seed.resolve()
    report = TaxonomyValidationReport(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        seed_path=str(seed_path.relative_to(Path.cwd()) if seed_path.is_relative_to(Path.cwd()) else seed_path),
        seed_statistics=seed_statistics(seed), seed_issues=issues,
    )
    if args.sandbox and report.errors == 0:
        ro_engine = create_readonly_engine(settings)
        check_connection(ro_engine)
        structure = build_structure_report(ro_engine, settings.db_schema, settings.app_schema,
                                           settings.describe_target())
        rw_engine = create_readwrite_engine(settings)
        with migrated_sandbox(rw_engine, args.sandbox_schema) as conn:
            store = TaxonomyStore(conn, args.sandbox_schema)
            report.sandbox_schema = args.sandbox_schema
            report.load_inserted = dict(store.load_seed(seed).inserted)
            report.load_updated_on_reload = dict(store.load_seed(seed).updated)
            report.database_issues = store.validate()
            report.example_lots = find_example_lots(store, structure)
            report.scenarios = ScenarioRunner(store, report.example_lots).run()
            report.database_statistics = store.statistics()
        with ro_engine.connect() as conn:
            report.sandbox_left_behind = bool(conn.execute(
                text("select exists(select 1 from pg_namespace where nspname = :s)"), {"s": args.sandbox_schema}
            ).scalar())

    paths = write_report(settings.reports_dir, "taxonomy_validation", report, render_taxonomy_markdown(report))
    st = report.seed_statistics
    print(f"Seed {args.seed} (version {st['version']}): {st['concepts']} concepts, {st['terms']} terms, "
          f"{st['relationships']} relationships, {st['source_categories']} source categories")
    for issue in issues:
        if issue.level != "info":
            print(f"  {issue.level}: {issue.message}")
    if report.sandbox_schema:
        passed = sum(s.status == "passed" for s in report.scenarios)
        print(f"Sandbox ({report.sandbox_schema}, rolled back; left behind: {report.sandbox_left_behind}): "
              f"{passed}/{len(report.scenarios)} scenarios passed, {len(report.database_issues)} database issue(s)")
        for s in report.scenarios:
            if s.status != "passed":
                print(f"  {s.status}: {s.group} — {s.name}: {s.detail}")
    print(f"Result: {report.errors} error(s), {report.failed_scenarios} failed scenario(s)")
    for p in paths:
        print(f"  {p}")
    ok = report.errors == 0 and report.failed_scenarios == 0 and not report.sandbox_left_behind
    return EXIT_OK if ok else EXIT_INVALID_TAXONOMY


def cmd_load_taxonomy(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.taxonomy.store import TaxonomyStore

    settings = _settings_for(args)
    seed, issues = _read_seed(args.seed)
    errors = [i for i in issues if i.level == "error"]
    if errors:
        for i in errors:
            print(f"error: {i.message}", file=sys.stderr)
        return EXIT_INVALID_TAXONOMY
    engine = create_readwrite_engine(settings)
    with engine.connect() as conn:
        trans = conn.begin()
        store = TaxonomyStore(conn, settings.app_schema)
        if not store.schema_ready():
            trans.rollback()
            log.error("schema not migrated; run `.venv/bin/alembic upgrade head` first",
                      extra={"schema": settings.app_schema})
            return EXIT_NOT_MIGRATED
        result = store.load_seed(seed, review_status="approved" if args.approve else "candidate",
                                 created_by=args.created_by)
        db_issues = [i for i in store.validate() if i.level == "error"]
        if args.dry_run or db_issues:
            trans.rollback()
        else:
            trans.commit()
    state = "rolled back (dry run)" if args.dry_run else ("rolled back (errors)" if db_issues else "committed")
    print(f"Version {result.version_label} (id {result.version_id}) — {state}")
    for kind in ("concepts", "terms", "relationships", "source_category_mappings"):
        print(f"  {kind:<26} inserted {result.inserted[kind]:>4}   updated {result.updated[kind]:>4}")
    if result.demoted_preferred_terms:
        print(f"  {result.demoted_preferred_terms} old preferred label(s) kept as synonyms")
    for i in db_issues:
        print(f"error: {i.message}", file=sys.stderr)
    return EXIT_INVALID_TAXONOMY if db_issues else EXIT_OK


def _print_concept(d: dict) -> None:  # type: ignore[type-arg]
    c = d["concept"]
    years = "" if c["start_year"] is None and c["end_year"] is None else f"  years {c['start_year']}–{c['end_year']}"
    print(f"{c['concept_key']}  [{c['dimension']}]{years}  status={c['review_status']}")
    for lang, note in (c.get("scope_notes") or {}).items():
        print(f"  note ({lang}): {note}")
    print("  Terms:")
    for t in d["terms"]:
        flag = " (ambiguous)" if t["is_ambiguous"] else ""
        print(f"    {t['language']}  {t['term_type']:<16} {t['term']}{flag}")
    if d["ancestors"]:
        print("  Broader (nearest first): " + " → ".join(d["ancestors"]))
    if d["narrower"]:
        print(f"  Narrower ({len(d['narrower'])}): " + ", ".join(d["narrower"]))
    for label, rows in (("Outgoing", d["outgoing"]), ("Incoming", d["incoming"])):
        rows = [r for r in rows if r["relationship_type"] != "broader"]
        if rows:
            print(f"  {label} associations:")
            for r in rows:
                print(f"    {r['relationship_type']:<22} {r['concept_key']} [{r['dimension']}]")
    for m in d["source_categories"]:
        print(f"  Drouot category: {m['category_fr']} / {m['category_en']} ({m['assertion']}, {m['confidence']})")


def cmd_show_concept(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.taxonomy.sandbox import SANDBOX_SCHEMA, migrated_sandbox
    from auction_search.taxonomy.store import TaxonomyStore

    settings = _settings_for(args)
    if args.sandbox:
        seed, issues = _read_seed(args.seed)
        if any(i.level == "error" for i in issues):
            return EXIT_INVALID_TAXONOMY
        with migrated_sandbox(create_readwrite_engine(settings)) as conn:
            store = TaxonomyStore(conn, SANDBOX_SCHEMA)
            store.load_seed(seed)
            details = store.describe(args.key)
    else:
        with create_readonly_engine(settings).connect() as conn:
            store = TaxonomyStore(conn, settings.app_schema)
            if not store.schema_ready():
                log.error("schema not migrated; run `.venv/bin/alembic upgrade head` or use --sandbox")
                return EXIT_NOT_MIGRATED
            details = store.describe(args.key)
    if details is None:
        log.error("concept not found", extra={"key": args.key})
        return EXIT_USAGE
    _print_concept(details)
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 3
# --------------------------------------------------------------------------------------


def _gazetteer(settings: Settings, conn):  # type: ignore[no-untyped-def]
    """Known terms from auction_search; the seed file if the schema has not been migrated."""
    from auction_search.enrichment.extraction import Gazetteer
    from auction_search.taxonomy.seed import load_seed_file
    from auction_search.taxonomy.store import TaxonomyStore

    if TaxonomyStore(conn, settings.app_schema).schema_ready():
        return Gazetteer.from_database(conn, settings.app_schema)
    log.warning("auction_search not migrated; using the seed file as the list of known terms")
    seed = load_seed_file(DEFAULT_SEED)
    return Gazetteer.from_rows((c.key, c.dimension, t.language, t.text, t.term_type, t.ambiguous)
                               for c in seed.concepts for t in c.terms)


def cmd_extract_terms(args: argparse.Namespace) -> int:
    from auction_search.database.inspection import build_structure_report
    from auction_search.enrichment.extraction import run_extraction

    settings = _settings_for(args)
    engine = create_readonly_engine(settings)
    check_connection(engine)
    structure = build_structure_report(engine, settings.db_schema, settings.app_schema, settings.describe_target())
    with engine.connect() as conn:
        gazetteer = _gazetteer(settings, conn)
    stats = run_extraction(engine, structure, gazetteer, args.cache_dir, limit=args.limit,
                           batch_size=args.batch_size, resume=args.resume, refresh=args.refresh)
    print(f"Lots processed: {stats.lots_processed:,} of {stats.lots_total_in_source:,}   "
          f"(extracted {stats.extracted:,}, cache hits {stats.cache_hits:,}, identical texts reused "
          f"{stats.duplicate_content_reused:,}, resumed after lot {stats.resumed_from_lot_id})")
    print(f"Known terms: {stats.gazetteer_terms}   Time: {stats.seconds} s   AI tokens: {stats.ai_tokens_used}")
    print("Mentions: " + ", ".join(f"{k} {v:,}" for k, v in stats.mentions_by_extractor.items()))
    print(f"Output: {stats.output}")
    return EXIT_OK


def _write_extraction_report(settings: Settings, cache_dir: Path, build, imported, mode: str):  # type: ignore[no-untyped-def]
    from auction_search.enrichment.extraction import load_extractions, load_stats
    from auction_search.reporting import write_report
    from auction_search.taxonomy.extraction_report import render_extraction_markdown, validation_targets

    stats = load_stats(cache_dir)
    validation = validation_targets(build, load_extractions(cache_dir))
    summary = {"extraction": stats, "params": build.params, "candidates_by_dimension": {},
               "below_threshold": build.below_threshold, "dropped": build.dropped, "validation": validation,
               "import": imported, "import_mode": mode, "ai_tokens_used": 0,
               "variant_suggestions": build.variant_suggestions, "synonym_suggestions": build.synonym_suggestions}
    for c in build.candidates:
        summary["candidates_by_dimension"][c.dimension] = summary["candidates_by_dimension"].get(c.dimension, 0) + 1
    return write_report(settings.reports_dir, "taxonomy_extraction", summary,
                        render_extraction_markdown(stats, build, validation, imported, mode))


def cmd_build_candidates(args: argparse.Namespace) -> int:
    from auction_search.enrichment.extraction import load_extractions
    from auction_search.taxonomy.builder import ExistingTaxonomy, build_candidates

    settings = _settings_for(args)
    records = load_extractions(args.cache_dir)
    with create_readonly_engine(settings).connect() as conn:
        gazetteer = _gazetteer(settings, conn)
        existing = ExistingTaxonomy.from_database(conn, settings.app_schema, gazetteer)
    build = build_candidates(records, gazetteer, existing, min_lots=args.min_lots)
    build.save(args.cache_dir / "candidates.json")
    paths = _write_extraction_report(settings, args.cache_dir, build, None, "not imported")
    by_dim: dict[str, int] = {}
    for c in build.candidates:
        by_dim[c.dimension] = by_dim.get(c.dimension, 0) + 1
    print(f"Candidates: {len(build.candidates):,}  " + ", ".join(f"{k} {v}" for k, v in sorted(by_dim.items())))
    print(f"Existing concepts attested: {len(build.attested)}   Spelling-variant suggestions: "
          f"{len(build.variant_suggestions)}   Synonym suggestions: {len(build.synonym_suggestions)}")
    print(f"Saved: {args.cache_dir / 'candidates.json'}")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


def cmd_import_candidates(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.taxonomy.builder import BuildResult
    from auction_search.taxonomy.importer import CandidateImporter
    from auction_search.taxonomy.store import TaxonomyStore

    settings = _settings_for(args)
    path = args.cache_dir / "candidates.json"
    if not path.exists():
        log.error("candidates.json not found; run build-candidates first", extra={"path": str(path)})
        return EXIT_USAGE
    build = BuildResult.load(path)
    with create_readwrite_engine(settings).connect() as conn:
        trans = conn.begin()
        if not TaxonomyStore(conn, settings.app_schema).schema_ready():
            trans.rollback()
            log.error("schema not migrated; run `.venv/bin/alembic upgrade head` first")
            return EXIT_NOT_MIGRATED
        result = CandidateImporter(conn, settings.app_schema).run(build, args.version_label, args.min_confidence)
        (trans.rollback if args.dry_run else trans.commit)()
    mode = "dry run (rolled back)" if args.dry_run else "committed"
    paths = _write_extraction_report(settings, args.cache_dir, build, result, mode)
    print(f"Version {result.version_label} — {mode}")
    print(f"  candidates considered {result.considered:,}, below --min-confidence {result.below_min_confidence:,}")
    print(f"  concepts inserted {result.concepts_inserted:,}, refreshed {result.concepts_refreshed:,}, "
          f"left alone (already reviewed) {result.concepts_kept_reviewed:,}")
    print(f"  terms {result.terms_inserted:,}, relationships {result.relationships_inserted:,}, "
          f"evidence rows {result.evidence_inserted:,}")
    for reason, n in result.skipped.items():
        print(f"  skipped — {reason}: {n}")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


def cmd_build_taxonomy(args: argparse.Namespace) -> int:
    for step in (cmd_extract_terms, cmd_build_candidates, cmd_import_candidates):
        code = step(args)
        if code != EXIT_OK:
            return code
    return EXIT_OK


def cmd_review_taxonomy(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.reporting import md_escape
    from auction_search.taxonomy.review import Reviewer

    settings = _settings_for(args)
    action = args.review_command
    if action in ("list", "export"):
        with create_readonly_engine(settings).connect() as conn:
            rows = Reviewer(conn, settings.app_schema).list(
                status=None if args.status == "all" else args.status, dimension=args.dimension,
                provenance=args.provenance, version=args.version_label, min_confidence=args.min_confidence,
                limit=args.limit)
        if action == "export":
            Reviewer.export_csv(rows, args.output, delimiter=args.delimiter)
            print(f"{len(rows):,} concepts written to {args.output}. Fill the 'decision' column with approve or "
                  f"reject (optionally correct label_fr / label_en), then run: review-taxonomy apply {args.output}")
        else:
            for r in rows:
                print(f"{r['concept_key']:<55} {r['dimension']:<11} {md_escape(r['label_fr'])[:28]:<28} "
                      f"{md_escape(r['label_en'])[:24]:<24} lots={r['lots']} conf={r['confidence']} "
                      f"{r['status']}")
            print(f"({len(rows)} shown)")
        return EXIT_OK

    with create_readwrite_engine(settings).connect() as conn:
        trans = conn.begin()
        reviewer = Reviewer(conn, settings.app_schema)
        result = (reviewer.apply_csv(args.input) if action == "apply"
                  else reviewer.set_status(args.keys, action))
        (trans.rollback if args.dry_run else trans.commit)()
    print(f"{'Dry run — rolled back' if args.dry_run else 'Committed'}: approved {result.approved}, rejected "
          f"{result.rejected}, labels changed {result.labels_changed}, terms updated {result.terms_updated}, "
          f"relationships updated {result.relationships_updated}")
    for key in result.unknown_keys:
        print(f"  unknown concept key: {key}", file=sys.stderr)
    for problem in result.invalid_rows:
        print(f"  {problem}", file=sys.stderr)
    return EXIT_USAGE if result.unknown_keys or result.invalid_rows else EXIT_OK


def cmd_publish_taxonomy(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.taxonomy.review import Reviewer

    settings = _settings_for(args)
    with create_readwrite_engine(settings).connect() as conn:
        trans = conn.begin()
        reviewer = Reviewer(conn, settings.app_schema)
        issues = reviewer.publication_issues(args.version_label) if args.dry_run else reviewer.publish(
            args.version_label)
        errors = [i for i in issues if i.level == "error"]
        (trans.rollback if args.dry_run or errors else trans.commit)()
    for i in issues:
        print(f"{i.level}: {i.message}", file=sys.stderr)
    if errors:
        print(f"Not published: {len(errors)} error(s).")
        return EXIT_INVALID_TAXONOMY
    print(f"Version {args.version_label}: {'checks passed (dry run, nothing published)' if args.dry_run else 'published'}")
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 4
# --------------------------------------------------------------------------------------


def _snapshot(settings: Settings, conn, scope: str):  # type: ignore[no-untyped-def]
    from auction_search.taxonomy.snapshot import TaxonomySnapshot

    snap = TaxonomySnapshot.load(conn, settings.app_schema, scope)
    if snap.scope == "draft":
        log.warning("no published taxonomy: using the unreviewed draft (seed + approved concepts); results are "
                    "provisional", extra={"concepts": len(snap.concepts)})
    return snap


def cmd_classify_lots(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.database.inspection import build_structure_report
    from auction_search.enrichment.classification_job import (
        quality_figures,
        render_classification_markdown,
        run_classification,
    )
    from auction_search.reporting import write_report

    settings = _settings_for(args)
    ro = create_readonly_engine(settings)
    check_connection(ro)
    structure = build_structure_report(ro, settings.db_schema, settings.app_schema, settings.describe_target())
    with ro.connect() as conn:
        snap = _snapshot(settings, conn, args.scope)
    rw = create_readwrite_engine(settings)
    only = None
    if getattr(args, "affected", False):
        from sqlalchemy import text as sql

        from auction_search.taxonomy.improvement import affected_lots

        with ro.connect() as conn:
            since = conn.execute(sql(f'select min(classified_at) from "{settings.app_schema}".lot_classification_state')
                                 ).scalar()
            only = affected_lots(conn, settings.app_schema, since) if since else None
        print(f"Affected lots: {'all (never classified)' if only is None else f'{len(only):,}'}")
    stats = run_classification(rw, settings.app_schema, structure, snap, limit=args.limit, batch_size=args.batch_size,
                               force=args.force or only is not None, dry_run=args.dry_run, only_lots=only)
    if only is not None and not args.dry_run:
        from sqlalchemy import text as sql

        # Lots not touched by the change are unaffected by definition: record the new taxonomy for them.
        with rw.begin() as conn:
            conn.execute(sql(f'update "{settings.app_schema}".lot_classification_state set taxonomy_fingerprint = :fp, '
                             f"taxonomy_scope = :scope where taxonomy_fingerprint <> :fp and not (lot_id = any(:only))"),
                         {"fp": snap.fingerprint, "scope": snap.scope, "only": sorted(only)})
    with ro.connect() as conn:
        figures = quality_figures(conn, settings.app_schema, snap)
    paths = write_report(settings.reports_dir, "classification_quality", {"run": stats, "figures": figures},
                         render_classification_markdown(stats, figures))
    print(f"Taxonomy scope: {stats.taxonomy_scope} ({len(snap.concepts)} concepts)   AI tokens: 0")
    print(f"Lots seen {stats.lots_seen:,}, classified {stats.classified:,}, unchanged {stats.unchanged_skipped:,}, "
          f"assertions written {stats.assertions_written:,}, flagged for review {stats.needs_review:,}, "
          f"{stats.seconds} s" + (" (dry run)" if args.dry_run else ""))
    print("Assertions: " + ", ".join(f"{k} {v:,}" for k, v in stats.by_assertion.items()))
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 5
# --------------------------------------------------------------------------------------


def cmd_benchmark_embeddings(args: argparse.Namespace) -> int:
    from auction_search.database.inspection import build_structure_report
    from auction_search.embeddings.benchmark import benchmark, choose, render_benchmark_markdown
    from auction_search.embeddings.generator import MODELS
    from auction_search.reporting import write_report

    settings = _settings_for(args)
    engine = create_readonly_engine(settings)
    structure = build_structure_report(engine, settings.db_schema, settings.app_schema, settings.describe_target())
    results, meta = benchmark(engine, structure, list(MODELS), sample_size=args.sample_size)
    best = choose(results)
    paths = write_report(settings.reports_dir, "embedding_benchmark", {"meta": meta, "results": results,
                                                                      "chosen": best.model},
                         render_benchmark_markdown(results, meta, best))
    for r in results:
        print(f"{r.model}: task A MRR {r.task_a['mrr']}, task B P@10 {r.task_b['mean_precision@10']}, "
              f"{r.docs_per_second} docs/s on {r.device}")
    print(f"Chosen: {best.model}   (set EMBEDDING_MODEL to change)")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


EMBEDDING_PROBES = ["pair of women's ankle boots", "Louis XIV period commode with Boulle marquetry",
                    "Chinese blue and white porcelain vase", "French eighteenth-century armchair",
                    "vintage designer handbag", "diamond ring in white gold", "landscape oil painting",
                    "silver tea set", "bronze sculpture of a horse", "Persian carpet"]


def cmd_build_embeddings(args: argparse.Namespace) -> int:
    import time as _time

    from sqlalchemy import text as sql

    from auction_search.database.connection import create_readwrite_engine
    from auction_search.database.inspection import build_structure_report
    from auction_search.embeddings.generator import Embedder, run_embeddings
    from auction_search.reporting import human_bytes, md_table, truncate, write_report

    settings = _settings_for(args)
    ro = create_readonly_engine(settings)
    check_connection(ro)
    structure = build_structure_report(ro, settings.db_schema, settings.app_schema, settings.describe_target())
    embedder = Embedder(args.model or settings.embedding_model, settings.embedding_device)
    stats = run_embeddings(create_readwrite_engine(settings), settings.app_schema, structure, embedder,
                           limit=args.limit, batch_size=args.batch_size, force=args.force, dry_run=args.dry_run)

    # Search latency through the HNSW index, and what English probes find (French text included).
    probes = []
    with ro.connect() as conn:
        for q in EMBEDDING_PROBES:
            vec = "[" + ",".join(f"{x:.6f}" for x in embedder.encode_query(q)) + "]"
            t0 = _time.perf_counter()
            rows = conn.execute(sql(
                f'select e.lot_id, 1 - (e.embedding <=> cast(:v as public.vector)) as sim, l.title_fr '
                f'from "{settings.app_schema}".lot_embeddings e join "{settings.db_schema}".lots l on l.id = e.lot_id '
                f"where e.model = :m order by e.embedding <=> cast(:v as public.vector) limit 5"),
                {"v": vec, "m": embedder.spec.name}).all()
            probes.append({"query": q, "ms": round((_time.perf_counter() - t0) * 1000, 1),
                           "top": [f"{r[0]} ({r[1]:.2f}) {truncate(r[2], 70)}" for r in rows]})
    md = "\n".join([
        "# Embedding performance (Phase 5)", "",
        f"- Model `{stats.model}` ({stats.dims} dimensions) on `{stats.device}`; loaded in {stats.model_load_seconds} s",
        f"- Lots seen {stats.lots_seen:,}; embedded {stats.embedded:,}; unchanged (skipped) {stats.unchanged_skipped:,}",
        f"- Encoding {stats.seconds_encoding} s ({stats.docs_per_second} lots/s); whole run {stats.seconds_total} s",
        f"- Table `lot_embeddings` {human_bytes(stats.table_bytes)} including indexes "
        f"({human_bytes(stats.index_bytes)} of indexes, HNSW cosine)",
        "- Memory: the model needs ≈ 0.5 GB on disk (Hugging Face cache) and ≈ 1 GB RAM/GPU memory while encoding.",
        "- AI tokens / paid API calls: 0", "",
        "## English probes (nearest lots by cosine similarity, HNSW index)", "",
        md_table(["Query", "Latency", "Top 5 (lot id, similarity, French title)"],
                 [(p["query"], f"{p['ms']} ms", " · ".join(p["top"])) for p in probes]), ""])
    paths = write_report(settings.reports_dir, "embedding_performance", {"stats": stats, "probes": probes}, md + "\n")
    print(f"Model {stats.model} on {stats.device}: embedded {stats.embedded:,}, unchanged {stats.unchanged_skipped:,}, "
          f"{stats.docs_per_second} lots/s, {stats.seconds_total} s total; table {human_bytes(stats.table_bytes)}")
    print("Probe latency (ms): " + ", ".join(str(p["ms"]) for p in probes))
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 6
# --------------------------------------------------------------------------------------

EXAMPLE_QUERIES = ["Find auctions selling shoes", "Find Louis XIV furniture", "Find French eighteenth-century armchairs",
                   "Find antique furniture with Boulle marquetry", "Find vintage designer handbags",
                   "Find French Baroque cabinets"]


def cmd_build_search_index(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.database.inspection import build_structure_report
    from auction_search.search.index import build_search_index

    settings = _settings_for(args)
    ro = create_readonly_engine(settings)
    check_connection(ro)
    structure = build_structure_report(ro, settings.db_schema, settings.app_schema, settings.describe_target())
    stats = build_search_index(create_readwrite_engine(settings), settings.app_schema, structure, limit=args.limit,
                               batch_size=args.batch_size, force=args.force)
    print(f"Lots seen {stats.lots_seen:,}, indexed {stats.indexed:,}, unchanged {stats.unchanged_skipped:,}, "
          f"{stats.seconds} s")
    return EXIT_OK


def _search_engine(settings: Settings, args: argparse.Namespace):  # type: ignore[no-untyped-def]
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.search.hybrid import HybridSearch

    ro = create_readonly_engine(settings)
    with ro.connect() as conn:
        snap = _snapshot(settings, conn, args.scope)
    embedder = None
    if not getattr(args, "no_semantic", False) and getattr(args, "mode", "broad") != "exact":
        from auction_search.embeddings.generator import Embedder

        embedder = Embedder(settings.embedding_model, settings.embedding_device)
    return HybridSearch(ro, settings.app_schema, snap, embedder, log_engine=create_readwrite_engine(settings))


def cmd_search(args: argparse.Namespace) -> int:
    from auction_search.reporting import to_json

    settings = _settings_for(args)
    engine = _search_engine(settings, args)
    resp = engine.search(args.query, mode=args.mode, limit=args.limit, language=args.language)
    if args.json:
        print(to_json(resp))
        return EXIT_OK
    u = resp.understanding
    print(f"{resp.query!r} — mode {resp.mode}, taxonomy {resp.taxonomy_scope}, {resp.took_ms} ms")
    print("Understood: " + ("; ".join(f"{c['text']} → {', '.join(c['concepts'][:4])}" for c in u["concepts"]) or "—")
          + (f"; intent {u['intent']}" if u["intent"] else "")
          + (f"; keywords: {' '.join(u['unresolved_terms'])}" if u["unresolved_terms"] else ""))
    print(f"Direct matches: {resp.total_direct}   Related suggestions: {resp.total_related}")
    for kind, hits in (("DIRECT", resp.direct), ("RELATED", resp.related)):
        for h in hits:
            print(f"  [{kind}] lot {h.lot_id} (auction {h.auction_id}, {(h.auction_date or '')[:10]}) score {h.score}")
            print(f"     {h.title[:110]}")
            print(f"     why: {'; '.join(h.explanation)[:160]}")
            if h.url:
                print(f"     {h.url}")
    return EXIT_OK


def cmd_compare_search(args: argparse.Namespace) -> int:
    from auction_search.reporting import md_table, truncate, write_report

    settings = _settings_for(args)
    engine = _search_engine(settings, args)
    rows, data = [], []
    for q in EXAMPLE_QUERIES:
        resp = engine.search(q, mode=args.mode, limit=10, language=args.language, log_query=False)
        raw = engine.keyword_baseline(q, 1000)
        cleaned_q = engine.content_words(q)
        cleaned = engine.keyword_baseline(cleaned_q, 1000)
        data.append({"query": q, "hybrid_direct": resp.total_direct, "hybrid_related": resp.total_related,
                     "keyword_raw": len(raw), "keyword_cleaned": len(cleaned), "cleaned_query": cleaned_q,
                     "took_ms": resp.took_ms, "top_direct": [(h.lot_id, h.title, h.explanation) for h in resp.direct],
                     "top_keyword_cleaned": cleaned[:10]})
        rows.append((q, len(raw), f"{len(cleaned)} ('{cleaned_q}')", resp.total_direct, resp.total_related,
                     f"{resp.took_ms} ms",
                     " · ".join(f"{h.lot_id} {truncate(h.title, 45)}" for h in resp.direct[:3]) or "—"))
    md = "\n".join([
        "# Hybrid search vs keyword search (Phase 6)", "",
        f"- Mode `{args.mode}`, taxonomy scope `{engine.snap.scope}`"
        + (" (unreviewed draft: results are provisional)" if engine.snap.scope == "draft" else ""), "",
        md_table(["Query", "Keyword: raw query", "Keyword: content words", "Hybrid direct", "Hybrid related",
                  "Hybrid time", "Top hybrid direct matches"], rows), "",
        "Keyword search is PostgreSQL full-text search on the same index (all words required). "
        "Counts are not precision: Phase 9 measures relevance (reports/search_evaluation.md).", ""])
    paths = write_report(settings.reports_dir, "search_comparison", data, md + "\n")
    for r in rows:
        print(f"{r[0]!r}: keyword raw {r[1]}, cleaned {r[2]}, hybrid direct {r[3]}, related {r[4]}, {r[5]}")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


def cmd_serve_api(args: argparse.Namespace) -> int:
    import uvicorn

    from auction_search.api.main import create_app

    uvicorn.run(create_app(_settings_for(args), semantic=not args.no_semantic), host=args.host, port=args.port)
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phases 7–8
# --------------------------------------------------------------------------------------


def cmd_expand_query(args: argparse.Namespace) -> int:
    from auction_search.reporting import to_json
    from auction_search.search.expansion import QueryExpander

    settings = _settings_for(args)
    with create_readonly_engine(settings).connect() as conn:
        snap = _snapshot(settings, conn, args.scope)
    expander = QueryExpander(snap)
    if args.criteria:
        from auction_search.search.criteria import criteria_for

        criteria = criteria_for(expander, args.query, language=args.language, depth=args.depth,
                                max_terms_per_group=args.max_queries or 40)
        if args.json:
            print(to_json(criteria.as_dict()))
            return EXIT_OK
        print(f"{criteria.query!r} — depth {criteria.depth}, taxonomy {criteria.taxonomy_scope}")
        print("A lot is relevant when it contains one keyword of EVERY required idea.")
        for n, g in enumerate(criteria.groups, 1):
            print(f"\nIdea {n}: {g.text!r} ({'required' if g.required else 'optional, ranking only'})")
            for lang in criteria.languages:
                print(f"  {lang}: {', '.join(g.words(lang)) or '—'}")
                if g.covered.get(lang):
                    print(f"      (not repeated, a shorter keyword covers them: {', '.join(sorted(g.covered[lang]))})")
        if criteria.soft_words:
            print(f"\nOther words (ranking only): {' '.join(criteria.soft_words)}")
        for lang in criteria.languages:
            print(f"\nAND/OR query ({lang}):\n  {criteria.boolean(lang)}")
        for lang in criteria.languages:
            phrases = [t.term for t in criteria.phrases.get(lang, [])]
            print(f"\nPhrases for search boxes without AND/OR ({lang}, {len(phrases)}):\n  {', '.join(phrases)}")
        return EXIT_OK
    plan = expander.expand(args.query, language=args.language, depth=args.depth, max_queries=args.max_queries or 20)
    if args.json:
        print(to_json(plan))
        return EXIT_OK
    print(f"{plan.query!r} — depth {plan.depth}, taxonomy {plan.taxonomy_scope}")
    print(f"Concepts: {', '.join(plan.concepts) or '—'}" + (f"   Unresolved: {' '.join(plan.unresolved_terms)}"
                                                            if plan.unresolved_terms else ""))
    for q in plan.queries:
        print(f"  p{q.priority}  {q.relationship:<18} {q.language:<3} {q.term}")
    return EXIT_OK


def cmd_search_external(args: argparse.Namespace) -> int:
    from auction_search.database.connection import create_readwrite_engine
    from auction_search.external.orchestrator import default_orchestrator
    from auction_search.reporting import to_json
    from auction_search.search.expansion import QueryExpander

    settings = _settings_for(args)
    ro = create_readonly_engine(settings)
    with ro.connect() as conn:
        snap = _snapshot(settings, conn, args.scope)
    orchestrator = default_orchestrator(snap, QueryExpander(snap), ro, create_readwrite_engine(settings), settings)
    providers = args.providers.split(",") if args.providers else None
    result = orchestrator.search(args.query, language=args.language, depth=args.depth, max_queries=args.max_queries,
                                 providers=providers, limit=args.limit, max_requests=args.max_requests)
    if args.json:
        print(to_json(result))
        return EXIT_OK
    print(f"{result.query!r} — providers: "
          + ", ".join(f"{p['name']} ({p['requests']} requests, {p['results']} results, {p['errors']} errors)"
                      for p in result.providers))
    print("Requests sent:")
    for r in result.requests:
        print(f"  {r['provider']} [{r['language']}] {r['results']:>3} results  {r['query']}"
              + (f"  ERROR {r['error']}" if r["error"] else ""))
    for kind, items in (("DIRECT", result.direct), ("RELATED", result.related)):
        for lot in items:
            print(f"  [{kind}] {lot.provider}:{lot.external_id} {lot.title[:90]}")
            print(f"     found by: {', '.join(lot.found_by[:4])}; {'; '.join(lot.validation)[:120]}")
    print("Useful expansions: " + ", ".join(f"{e['term']} ({e['direct_matches']})" for e in result.expansions
                                            if e["direct_matches"]))
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 9
# --------------------------------------------------------------------------------------


def _evaluation(settings: Settings, scope: str):  # type: ignore[no-untyped-def]
    from auction_search.database.inspection import build_structure_report
    from auction_search.embeddings.generator import Embedder
    from auction_search.search.evaluation import evaluate
    from auction_search.search.hybrid import HybridSearch

    ro = create_readonly_engine(settings)
    structure = build_structure_report(ro, settings.db_schema, settings.app_schema, settings.describe_target())
    with ro.connect() as conn:
        snap = _snapshot(settings, conn, scope)
    engine = HybridSearch(ro, settings.app_schema, snap, Embedder(settings.embedding_model, settings.embedding_device),
                          log_engine=None)
    return evaluate(engine, ro, structure), snap, ro, engine


def cmd_evaluate_search(args: argparse.Namespace) -> int:
    import json

    from sqlalchemy import text as sql

    from auction_search.reporting import write_report
    from auction_search.search.evaluation import BENCHMARK_DIR, render_evaluation_markdown, write_judgement_pool

    settings = _settings_for(args)
    ev, snap, ro, engine = _evaluation(settings, args.scope)
    if args.log_queries:
        from auction_search.database.connection import create_readwrite_engine

        engine.log_engine = create_readwrite_engine(settings)
        for q in ev.queries:
            engine.search(q.query, mode="broad", limit=10, log_query=True)
        print(f"Logged {len(ev.queries)} benchmark queries in search_queries (replayed, not real users)")
    with ro.connect() as conn:
        titles = {r[0]: (r[1] or "", r[2] or "") for r in conn.execute(sql(
            f'select lot_id, title_fr, title_en from "{settings.app_schema}".lot_search_documents'))}
    pool = write_judgement_pool(ev, titles, BENCHMARK_DIR / "judgements_to_review.csv")
    data = {"summary": ev.summary, "analysis": ev.analysis, "human_labels": ev.human_labels,
            "relevant_counts": {k: len(v) for k, v in ev.relevant.items()},
            "per_query": [{"system": r.system, "query_id": r.query_id, "ms": r.ms, **r.metrics} for r in ev.results]}
    paths = write_report(settings.reports_dir, "search_evaluation", data,
                         render_evaluation_markdown(ev, snap.scope, pool))
    if args.save_baseline:
        (BENCHMARK_DIR / "baseline_metrics.json").write_text(json.dumps(ev.summary, indent=2) + "\n", encoding="utf-8")
        print(f"Baseline saved: {BENCHMARK_DIR / 'baseline_metrics.json'}")
    for name, m in ev.summary.items():
        print(f"{name:<16} P@10 {m['precision@10']:.3f}  R@50 {m['recall@50']:.3f}  nDCG@10 {m['ndcg@10']:.3f}  "
              f"MRR {m['mrr']:.3f}  no-result {m['zero_result_queries']}  {m['mean_ms']} ms (p95 {m['p95_ms']})")
    print(f"Judgement pool: {pool} rows   Human labels applied: {ev.human_labels}")
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


# --------------------------------------------------------------------------------------
# Phase 10
# --------------------------------------------------------------------------------------


def cmd_improve_taxonomy(args: argparse.Namespace) -> int:
    from dataclasses import asdict

    from auction_search.database.connection import create_readwrite_engine
    from auction_search.enrichment.extraction import load_extractions
    from auction_search.reporting import md_table, write_report
    from auction_search.taxonomy.improvement import ImprovementResult, TaxonomyImprover, write_suggestions_csv

    settings = _settings_for(args)
    result = ImprovementResult(args.version_label, dry_run=args.dry_run)
    with create_readwrite_engine(settings).connect() as conn:
        trans = conn.begin()
        snap = _snapshot(settings, conn, args.scope)
        improver = TaxonomyImprover(conn, settings.app_schema, snap)
        terms = improver.unresolved_terms(args.min_searches)
        result.unresolved_terms = dict(terms.most_common())
        improver.search_demand(result, terms, args.dry_run)
        records = load_extractions(args.cache_dir) if (args.cache_dir / "lots.jsonl").exists() else None
        improver.missing_translations(result, records)
        improver.cooccurrence_relationships(result)
        improver.low_confidence(result)
        if not args.dry_run and (result.translations_proposed or result.relationships_proposed):
            improver.write_proposals(result)
        (trans.rollback if args.dry_run else trans.commit)()
    if args.extract and not args.dry_run:
        ns = argparse.Namespace(**vars(args), limit=None, batch_size=500, resume=False, refresh=False, min_lots=3,
                                min_confidence=0.4)
        for step in (cmd_extract_terms, cmd_build_candidates, cmd_import_candidates):
            step(ns)
    write_suggestions_csv(result, settings.reports_dir / "search_feedback_suggestions.csv")
    md = "\n".join([
        "# Taxonomy improvement (Phase 10)", "",
        f"- Draft version `{result.version_label}`" + (" — dry run, nothing written" if args.dry_run else "")
        + "; every proposal is a `candidate` for the review workflow; nothing is approved or published.",
        "- Sources: the project's own search log, lots and classifications. External provider results are never "
        "used to change the taxonomy.", "",
        "## Words searched but not understood", "",
        md_table(["Term", "Searches"], list(result.unresolved_terms.items())) if result.unresolved_terms else "_none_", "",
        "Matched an existing unreviewed candidate (marked `search_demand` so it is reviewed first): "
        + (", ".join(f"`{t}` → `{k}`" for t, k in result.demand_marked.items()) or "none"), "",
        "For a human to decide (`reports/search_feedback_suggestions.csv`): ", "",
        md_table(["Term", "Searches", "Lots containing it", "Concepts of those lots"],
                 [(x["term"], x["searches"], x["lots"], x["top_concepts"]) for x in result.suggestions]), "",
        "## Proposed translations", "",
        md_table(["Concept", "Language", "Term", "Dice", "Lots"],
                 [(p["concept"], p["language"], p["term"], p["dice"], p["lots"]) for p in result.translations_proposed])
        if result.translations_proposed else "_none_", "",
        "## Proposed relationships (co-occurrence in classified lots)", "",
        md_table(["Source", "Type", "Target", "Lots", "Lift"],
                 [(p["source"], p["type"], p["target"], p["lots"], p["lift"]) for p in result.relationships_proposed])
        if result.relationships_proposed else "_none_", "",
        "## Lots with low-confidence or uncertain classifications", "",
        md_table(["Reason", "Count"], list(result.low_confidence.items())), ""])
    paths = write_report(settings.reports_dir, "taxonomy_improvement", asdict(result), md + "\n")
    print(f"Unresolved search terms: {len(result.unresolved_terms)}; matched to candidates: {len(result.demand_marked)}; "
          f"suggestions for a human: {len(result.suggestions)}")
    print(f"Proposed: {len(result.translations_proposed)} translations, {len(result.relationships_proposed)} relationships"
          + (" (dry run)" if args.dry_run else f" in draft version {result.version_label}"))
    for p in paths:
        print(f"  {p}")
    return EXIT_OK


EXIT_REGRESSION = 6


def cmd_run_regression(args: argparse.Namespace) -> int:
    import json

    from sqlalchemy import text as sql

    from auction_search.external.mock_provider import MockProvider
    from auction_search.external.orchestrator import ExternalSearchOrchestrator
    from auction_search.reporting import md_table, write_report
    from auction_search.search.evaluation import BENCHMARK_DIR

    settings = _settings_for(args)
    baseline_path = BENCHMARK_DIR / "baseline_metrics.json"
    if not baseline_path.exists():
        log.error("no baseline: run evaluate-search --save-baseline first")
        return EXIT_USAGE
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    ev, snap, ro, engine = _evaluation(settings, args.scope)
    checks: list[tuple[str, bool, str]] = []
    for system in ("hybrid_broad", "hybrid_exact"):
        now, base = ev.summary[system], baseline[system]
        for m in ("precision@10", "recall@50", "ndcg@10"):
            checks.append((f"{system} {m}", base[m] - now[m] <= args.tolerance, f"{base[m]} → {now[m]}"))
        checks.append((f"{system} queries without result", now["zero_result_queries"] <= base["zero_result_queries"],
                       f"{base['zero_result_queries']} → {now['zero_result_queries']}"))
        limit = max(2 * base["mean_ms"], base["mean_ms"] + 50)
        checks.append((f"{system} mean latency", now["mean_ms"] <= limit, f"{base['mean_ms']} → {now['mean_ms']} ms"))
    s = f'"{settings.app_schema}"'
    with ro.connect() as conn:
        def count(q: str) -> int:
            return int(conn.execute(sql(q)).scalar_one())
        checks.append(("dated_to only on periods, in_style_of only on styles", count(
            f"select count(*) from {s}.lot_concepts lc join {s}.taxonomy_concepts c on c.id = lc.concept_id where "
            f"(lc.assertion = 'dated_to' and c.dimension <> 'period') or (lc.assertion = 'in_style_of' and "
            f"c.dimension <> 'style')") == 0, "lot_concepts"))
        checks.append(("published views show approved rows only", count(
            f"select count(*) from {s}.published_concepts where review_status <> 'approved'") == 0, "published_concepts"))
        checks.append(("no classification uses a rejected concept", count(
            f"select count(*) from {s}.lot_concepts lc join {s}.taxonomy_concepts c on c.id = lc.concept_id "
            f"where c.review_status = 'rejected'") == 0, "reclassify after rejecting concepts"))
        tables = ("taxonomy_concepts", "taxonomy_terms", "taxonomy_relationships")
        before = [count(f"select count(*) from {s}.{t}") for t in tables]
        ExternalSearchOrchestrator({"mock": MockProvider()}, engine.expander, snap).search("Louis XIV furniture")
        after = [count(f"select count(*) from {s}.{t}") for t in tables]
        checks.append(("external search does not modify the taxonomy", before == after, f"{before} → {after}"))
    failed = [c for c in checks if not c[1]]
    md = "\n".join(["# Regression check (Phase 10)", "",
                     f"- Baseline: `{baseline_path.name}`; tolerance {args.tolerance}; taxonomy scope `{snap.scope}`",
                     f"- Result: **{'PASS' if not failed else f'FAIL ({len(failed)})'}**", "",
                     md_table(["Check", "Result", "Detail"], [(c[0], "pass" if c[1] else "FAIL", c[2]) for c in checks]),
                     ""])
    paths = write_report(settings.reports_dir, "regression", {"checks": checks, "summary": ev.summary}, md + "\n")
    for c in checks:
        print(f"  {'pass' if c[1] else 'FAIL'}  {c[0]}: {c[2]}")
    print("Regression check: " + ("PASS" if not failed else f"FAIL ({len(failed)} checks)"))
    for p in paths:
        print(f"  {p}")
    return EXIT_OK if not failed else EXIT_REGRESSION


def cmd_maintain(args: argparse.Namespace) -> int:
    common = {"schema": None, "output_dir": args.output_dir, "limit": None, "force": False, "dry_run": False}
    steps = [
        (cmd_build_search_index, {"batch_size": 1000}),
        (cmd_classify_lots, {"scope": args.scope, "batch_size": 500, "resume": False, "affected": True}),
        (cmd_build_embeddings, {"model": None, "batch_size": 256, "resume": False}),
        (cmd_run_regression, {"scope": args.scope, "tolerance": args.tolerance}),
    ]
    for fn, extra in steps:
        print(f"== {fn.__name__.removeprefix('cmd_').replace('_', '-')}")
        code = fn(argparse.Namespace(**common, **extra))
        if code != EXIT_OK:
            return code
    return EXIT_OK


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        settings = get_settings()
    except Exception as exc:  # pydantic ValidationError: bad env values
        print(f"Configuration error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    configure_logging(args.log_level or settings.log_level, args.log_format or settings.log_format)
    try:
        return int(args.func(args))
    except SQLAlchemyError as exc:
        # Never echo the URL: psycopg messages do not include passwords, but keep it short anyway.
        log.error("database error", extra={"error": str(exc).splitlines()[0], "target": settings.describe_target()})
        return EXIT_DB_ERROR
    except LookupError as exc:
        log.error(str(exc))
        return EXIT_USAGE
    except (OSError, ValueError) as exc:  # unreadable seed file, SeedFormatError, non-draft version
        log.error(str(exc))
        return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
