"""Application configuration loaded from environment variables and an optional ``.env`` file.

All database credentials come from the environment (``DB_USER``, ``DB_PASSWORD``); nothing
is hard-coded. When ``DB_USER``/``DB_PASSWORD`` are empty, libpq defaults apply (the OS user,
``~/.pgpass``, ``PGUSER``/``PGPASSWORD``), which is how a local Homebrew PostgreSQL usually works.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

# The project folder (where pyproject.toml, .env, reports/ and .cache/ live), whatever the working directory.
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Schema and table names are interpolated into SQL (always double-quoted), so they are
# restricted to plain lower-case identifiers to rule out injection through configuration.
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def validate_identifier(value: str) -> str:
    """Return ``value`` if it is a safe, unquoted PostgreSQL identifier, else raise ``ValueError``."""
    if not _IDENTIFIER.match(value):
        raise ValueError(f"invalid PostgreSQL identifier: {value!r}")
    return value


class Settings(BaseSettings):
    """Runtime settings. Field ``db_host`` maps to env var ``DB_HOST``, and so on."""

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "events_monitor_db"
    db_schema: str = "drouot_collector"
    db_user: str | None = None
    db_password: SecretStr | None = None
    db_statement_timeout_ms: int = 120_000

    app_schema: str = "auction_search"

    # Local sentence-transformers model (no paid API). Chosen by benchmark-embeddings, Phase 5.
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_device: str | None = None  # None = Apple GPU (mps) if available, else cpu

    reports_dir: Path = PROJECT_ROOT / "reports"
    log_level: str = "INFO"
    log_format: Literal["text", "json"] = "text"

    # Shared secret the Sourcing agent's back end sends as X-Service-Token (env TAXONOMY_SERVICE_TOKEN).
    # Required by every endpoint except /api/health when set; the admin API refuses to run without it.
    taxonomy_service_token: SecretStr | None = None
    jobs_dir: Path = PROJECT_ROOT / ".cache" / "jobs"

    @field_validator("db_user", "db_password", "taxonomy_service_token", mode="before")
    @classmethod
    def _empty_to_none(cls, value: object) -> object:
        # ``DB_USER=`` in .env arrives as "" — treat it as "not set" so libpq defaults apply.
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("db_schema", "app_schema")
    @classmethod
    def _check_identifier(cls, value: str) -> str:
        return validate_identifier(value)

    def sqlalchemy_url(self) -> URL:
        """Build the SQLAlchemy URL (psycopg 3 driver). The password never appears in ``str(url)``."""
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password.get_secret_value() if self.db_password else None,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    def describe_target(self) -> str:
        """Human-readable connection target with no secrets, for logs and reports."""
        user = self.db_user or "(libpq default user)"
        return f"postgresql://{user}@{self.db_host}:{self.db_port}/{self.db_name} schema={self.db_schema}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings once per process."""
    return Settings()
