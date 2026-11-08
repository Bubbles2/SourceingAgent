"""Unit tests for the inference rules in ``database.inspection`` (no database needed)."""

import pytest

from auction_search.database.inspection import (
    ColumnInfo,
    ForeignKeyInfo,
    TableInfo,
    build_source_mapping,
    classify_column,
    detect_table_roles,
)


@pytest.mark.parametrize(
    ("name", "dtype", "role", "lang"),
    [
        ("title_fr", "text", "title", "fr"),
        ("description_en", "text", "description", "en"),
        ("category_fr", "text", "category", "fr"),
        ("lot_url_en", "text", "url", "en"),
        ("auction_url_fr", "text", "url", "fr"),
        ("image_url", "text", "image_url", None),
        ("lot_number", "text", "lot_number", None),
        ("lot_id", "text", "identifier", None),
        ("auction_id", "text", "identifier", None),
        ("id", "bigint", "identifier", None),
        ("auction_house", "text", "auction_house", None),
        ("currency", "text", "currency", None),
        ("details_status", "text", "status", None),
        ("last_error", "text", "error", None),
        ("auction_date", "date", "date", None),
        ("starts_at", "timestamp with time zone", "date", None),
        ("updated_at", "timestamp with time zone", "record_timestamp", None),
        ("options", "jsonb", "metadata", None),
        ("catalogue_page_count", "integer", "count", None),
        ("estimate_low", "numeric(14,2)", "price", None),
        ("page_number", "integer", "other", None),
    ],
)
def test_classify_column(name: str, dtype: str, role: str, lang: str | None) -> None:
    assert classify_column(name, dtype) == (role, lang)


def _col(name: str, dtype: str = "text") -> ColumnInfo:
    role, lang = classify_column(name, dtype)
    return ColumnInfo(name, dtype, True, None, None, role, lang)


def _table(name: str, columns: list[str], fks: list[ForeignKeyInfo] | None = None) -> TableInfo:
    return TableInfo(
        name=name, kind="table", comment=None, row_count=0, row_count_is_estimate=False, total_bytes=0,
        columns=[_col(c) for c in columns], primary_key=["id"], unique_constraints=[], check_constraints=[],
        foreign_keys=fks or [], indexes=[],
    )


def _drouot_like_tables() -> list[TableInfo]:
    fk = ForeignKeyInfo("lots_fk", ["source", "auction_id"], "s", "auctions", ["source", "auction_id"])
    run_fk = ForeignKeyInfo("ra_fk", ["source", "auction_id"], "s", "auctions", ["source", "auction_id"])
    return [
        _table("auctions", ["id", "source", "auction_id", "title_fr", "title_en", "description_fr"]),
        _table("run_auctions", ["run_id", "source", "auction_id", "status"], [run_fk]),
        _table("lots", ["id", "source", "auction_id", "lot_id", "title_fr", "description_fr", "category_en"], [fk]),
        _table("collection_runs", ["id", "status"]),
    ]


def test_detects_auction_and_lot_tables_with_fk_evidence() -> None:
    d = detect_table_roles(_drouot_like_tables())
    assert d.auction_table == "auctions"
    assert d.lot_table == "lots"
    assert d.confident is True
    assert any("foreign key lots(source, auction_id) -> auctions" in e for e in d.evidence)


def test_detection_without_foreign_key_is_not_confident() -> None:
    tables = [_table("ventes", ["id", "titre"]), _table("lot", ["id", "title_fr", "description_fr"])]
    d = detect_table_roles(tables)
    assert (d.auction_table, d.lot_table, d.confident) == ("ventes", "lot", False)
    assert any("WARNING" in e for e in d.evidence)


def test_detection_with_no_candidates() -> None:
    d = detect_table_roles([_table("collection_runs", ["id"])])
    assert d.auction_table is None and d.lot_table is None and not d.confident
    assert build_source_mapping("s", [], d) is None


def test_source_mapping_exposes_roles_by_language() -> None:
    tables = _drouot_like_tables()
    m = build_source_mapping("s", tables, detect_table_roles(tables))
    assert m is not None
    assert m.join_columns == [("source", "source"), ("auction_id", "auction_id")]
    assert m.lots.by_language("title") == {"fr": "title_fr"}
    assert m.lots.by_language("category") == {"en": "category_en"}
    assert m.auctions.by_language("title") == {"fr": "title_fr", "en": "title_en"}
    assert "lot_id" in m.lots.names("identifier")
