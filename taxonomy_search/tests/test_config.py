import pytest
from pydantic import ValidationError

from auction_search.config import Settings, validate_identifier


def test_defaults_match_project_database(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_SCHEMA", "DB_USER", "DB_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    s = Settings(_env_file=None)
    assert (s.db_host, s.db_port, s.db_name, s.db_schema) == ("localhost", 5432, "events_monitor_db", "drouot_collector")
    assert s.app_schema == "auction_search"


def test_empty_credentials_fall_back_to_libpq_defaults() -> None:
    s = Settings(_env_file=None, db_user="", db_password="  ")
    assert s.db_user is None and s.db_password is None
    url = s.sqlalchemy_url()
    assert url.username is None and url.password is None


def test_password_never_rendered() -> None:
    s = Settings(_env_file=None, db_user="reader", db_password="s3cret")
    assert "s3cret" not in str(s.sqlalchemy_url())
    assert "s3cret" not in s.describe_target()
    assert "s3cret" not in repr(s)
    assert s.sqlalchemy_url().password == "s3cret"


@pytest.mark.parametrize("bad", ["Drouot", "drouot-collector", "x; drop table lots", "", "1abc", 'a"b'])
def test_rejects_unsafe_schema_names(bad: str) -> None:
    with pytest.raises(ValueError):
        validate_identifier(bad)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, db_schema=bad)


def test_accepts_plain_identifiers() -> None:
    assert validate_identifier("drouot_collector") == "drouot_collector"
    assert validate_identifier("_x9") == "_x9"
