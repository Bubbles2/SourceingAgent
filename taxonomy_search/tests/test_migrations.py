"""Migration behaviour that needs no database: offline SQL generation and safety guards."""

import io

import pytest
from alembic import command
from alembic.config import Config

from auction_search.taxonomy.sandbox import PROJECT_ROOT


def _offline_sql(app_schema: str | None = None) -> str:
    buffer = io.StringIO()
    cfg = Config(str(PROJECT_ROOT / "alembic.ini"), output_buffer=buffer)
    if app_schema:
        cfg.attributes["app_schema"] = app_schema
    command.upgrade(cfg, "head", sql=True)
    return buffer.getvalue()


def test_offline_sql_creates_only_application_schema_objects() -> None:
    sql = _offline_sql()
    assert 'create schema if not exists "auction_search"' in sql
    for table in ("taxonomy_versions", "taxonomy_concepts", "taxonomy_terms", "taxonomy_relationships",
                  "lot_concepts", "taxonomy_evidence", "source_category_mappings"):
        assert f"CREATE TABLE auction_search.{table}" in sql
    assert "CREATE TABLE auction_search.alembic_version" in sql
    assert "drouot_collector" not in sql
    lowered = sql.lower()
    for statement in ("drop table", "drop schema", "truncate", "delete from", "alter table drouot"):
        assert statement not in lowered


@pytest.mark.parametrize("schema", ["drouot_collector", "public", "drouot_collector_py"])
def test_refuses_source_and_system_schemas(schema: str) -> None:
    with pytest.raises(RuntimeError, match="refusing to run migrations"):
        _offline_sql(schema)
