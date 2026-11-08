"""Helpers for writing machine-readable (JSON) and human-readable (Markdown) reports."""

from __future__ import annotations

import dataclasses
import json
import logging
from collections.abc import Iterable, Sequence
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

log = logging.getLogger(__name__)


def _json_default(value: object) -> object:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return dataclasses.asdict(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def to_json(data: object) -> str:
    if dataclasses.is_dataclass(data) and not isinstance(data, type):
        data = dataclasses.asdict(data)
    return json.dumps(data, default=_json_default, ensure_ascii=False, indent=2)


def write_report(output_dir: Path, stem: str, data: object, markdown: str | None = None) -> list[Path]:
    """Write ``<stem>.json`` (and ``<stem>.md`` if given) into ``output_dir``; return the paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written = []
    json_path = output_dir / f"{stem}.json"
    json_path.write_text(to_json(data) + "\n", encoding="utf-8")
    written.append(json_path)
    if markdown is not None:
        md_path = output_dir / f"{stem}.md"
        md_path.write_text(markdown, encoding="utf-8")
        written.append(md_path)
    for path in written:
        log.info("report written", extra={"path": str(path)})
    return written


def md_escape(value: object) -> str:
    """Make a value safe for a single Markdown table cell."""
    if value is None:
        return ""
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def md_table(headers: Sequence[str], rows: Iterable[Sequence[object]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    lines += ["| " + " | ".join(md_escape(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def truncate(text: str | None, length: int) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text if len(text) <= length else text[: length - 1].rstrip() + "…"


def human_bytes(n: int | None) -> str:
    if n is None:
        return ""
    size = float(n)
    for unit in ("B", "kB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{n} B"


def pct(part: int | float, whole: int | float) -> str:
    return "n/a" if not whole else f"{100.0 * part / whole:.1f}%"
