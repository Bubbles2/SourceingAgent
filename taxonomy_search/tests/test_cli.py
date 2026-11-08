from pathlib import Path

import pytest

from auction_search.cli import (
    EXIT_INVALID_TAXONOMY,
    EXIT_NOT_MIGRATED,
    EXIT_OK,
    EXIT_USAGE,
    build_parser,
    main,
)
from auction_search.config import get_settings

COMMANDS = ["check-db", "inspect-db", "analyze-lots", "validate-taxonomy", "load-taxonomy", "show-concept",
            "extract-terms", "build-candidates", "import-candidates", "build-taxonomy", "review-taxonomy",
            "publish-taxonomy", "classify-lots", "benchmark-embeddings", "build-embeddings", "build-search-index",
            "search", "compare-search", "serve-api", "expand-query", "search-external", "evaluate-search",
            "improve-taxonomy", "run-regression", "maintain"]


@pytest.mark.parametrize("argv", [["--help"], *[[c, "--help"] for c in COMMANDS]])
def test_every_command_supports_help(argv: list[str], capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        build_parser().parse_args(argv)
    assert exc.value.code == 0
    assert "usage:" in capsys.readouterr().out


@pytest.mark.parametrize(
    "argv",
    [
        ["analyze-lots", "--limit", "0"],
        ["analyze-lots", "--language-sample", "-1"],
        ["inspect-db", "--schema", "Bad-Name"],
        ["no-such-command"],
    ],
)
def test_invalid_arguments_are_rejected(argv: list[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        build_parser().parse_args(argv)
    assert exc.value.code == EXIT_USAGE


def test_unknown_table_override_is_a_usage_error(live_engine, tmp_path) -> None:  # type: ignore[no-untyped-def]
    code = main(["--log-level", "ERROR", "inspect-db", "--lot-table", "does_not_exist", "--output-dir", str(tmp_path)])
    assert code == EXIT_USAGE


def test_validate_taxonomy_offline(tmp_path: Path) -> None:
    assert main(["--log-level", "ERROR", "validate-taxonomy", "--output-dir", str(tmp_path)]) == EXIT_OK
    assert (tmp_path / "taxonomy_validation.md").stat().st_size > 0


def test_validate_taxonomy_reports_errors(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("version: x\nconcepts:\n  - {key: a, dimension: colour, labels: {fr: Rouge, en: Red}}\n",
                   encoding="utf-8")
    code = main(["--log-level", "ERROR", "validate-taxonomy", "--seed", str(bad), "--output-dir", str(tmp_path)])
    assert code == EXIT_INVALID_TAXONOMY


def test_unreadable_seed_is_a_usage_error(tmp_path: Path) -> None:
    code = main(["--log-level", "ERROR", "validate-taxonomy", "--seed", str(tmp_path / "missing.yaml"),
                 "--output-dir", str(tmp_path)])
    assert code == EXIT_USAGE


def test_load_taxonomy_refuses_unmigrated_schema(live_engine, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("APP_SCHEMA", "auction_search_never_created")
    get_settings.cache_clear()
    try:
        assert main(["--log-level", "CRITICAL", "load-taxonomy", "--dry-run"]) == EXIT_NOT_MIGRATED
    finally:
        get_settings.cache_clear()
