"""Integration tests against the real ``events_monitor_db`` (read-only). Skipped if unreachable.

They assert structural facts discovered in Phase 1, so a change to the source schema shows up
here first.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import Engine, text

from auction_search.cli import EXIT_OK, main
from auction_search.config import Settings
from auction_search.database.connection import check_connection
from auction_search.database.data_quality import build_data_quality_report
from auction_search.database.data_quality_report import render_data_quality_markdown, render_samples_markdown
from auction_search.database.inspection import build_structure_report
from auction_search.database.inspection_report import render_structure_markdown

pytestmark = pytest.mark.integration


def test_session_is_read_only(live_engine: Engine) -> None:
    assert check_connection(live_engine).transaction_read_only == "on"
    with live_engine.connect() as conn:
        assert conn.execute(text("show default_transaction_read_only")).scalar() == "on"


def test_structure_identifies_auctions_and_lots(live_engine: Engine, settings: Settings) -> None:
    r = build_structure_report(live_engine, settings.db_schema, settings.app_schema, settings.describe_target())
    assert r.detection.auction_table == "auctions"
    assert r.detection.lot_table == "lots"
    assert r.detection.confident
    assert r.mapping is not None
    assert r.mapping.join_columns == [("source", "source"), ("auction_id", "auction_id")]
    assert r.mapping.lots.by_language("title") == {"fr": "title_fr", "en": "title_en"}
    assert r.mapping.lots.by_language("description") == {"fr": "description_fr", "en": "description_en"}
    assert r.mapping.lots.by_language("category") == {"fr": "category_fr", "en": "category_en"}
    lots = next(t for t in r.tables if t.name == "lots")
    assert lots.primary_key == ["id"]
    assert (lots.row_count or 0) > 0
    assert "# Database structure report" in render_structure_markdown(r)


def test_data_quality_on_a_limited_sample(live_engine: Engine, settings: Settings) -> None:
    structure = build_structure_report(live_engine, settings.db_schema, settings.app_schema, "test")
    report, samples = build_data_quality_report(
        live_engine, structure, "test", lot_limit=500, language_sample=200, samples_per_category=1, max_categories=5
    )
    assert report.lots_analysed == 500
    assert report.orphan_lots == 0
    assert {p.role for p in report.language_pairs if p.table == "lots"} == {"title", "description", "category"}
    assert report.categories is not None and report.categories.categories
    assert 1 <= len(samples.samples) <= 5
    assert "# Initial data quality report" in render_data_quality_markdown(report)
    assert "# Representative lot samples" in render_samples_markdown(samples)


def test_cli_writes_reports(live_engine: Engine, tmp_path: Path) -> None:
    assert main(["--log-level", "ERROR", "inspect-db", "--output-dir", str(tmp_path)]) == EXIT_OK
    assert main(["--log-level", "ERROR", "analyze-lots", "--limit", "300", "--output-dir", str(tmp_path)]) == EXIT_OK
    for name in ("database_structure.md", "database_structure.json", "source_mapping.json",
                 "data_quality.md", "data_quality.json", "lot_samples.md", "lot_samples.json"):
        assert (tmp_path / name).stat().st_size > 0, name
    mapping = json.loads((tmp_path / "source_mapping.json").read_text())
    assert mapping["lots"]["table"] == "lots"
