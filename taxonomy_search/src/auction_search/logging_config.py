"""Structured logging on top of the standard library.

Pass context as ``extra``: ``log.info("table inspected", extra={"table": "lots", "rows": 20923})``.
Extra fields are rendered as ``key=value`` pairs (text format) or as JSON keys (json format).
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

# Attributes every LogRecord has; anything else on the record came from ``extra``.
_STANDARD_ATTRS = frozenset(vars(logging.makeLogRecord({}))) | {"message", "asctime", "taskName"}


def _extra_fields(record: logging.LogRecord) -> dict[str, object]:
    return {k: v for k, v in vars(record).items() if k not in _STANDARD_ATTRS}


class TextFormatter(logging.Formatter):
    """``2026-11-07T10:00:00Z INFO auction_search.x message key=value ...``"""

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        parts = [ts, record.levelname, record.name, record.getMessage()]
        parts += [f"{k}={v}" for k, v in _extra_fields(record).items()]
        line = " ".join(parts)
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


class JsonFormatter(logging.Formatter):
    """One JSON object per line, suitable for log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
            **_extra_fields(record),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO", fmt: str = "text") -> None:
    """Send logs to stderr (stdout is kept for command output)."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # SQLAlchemy is noisy at INFO; its SQL echo is not wanted in normal runs.
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
