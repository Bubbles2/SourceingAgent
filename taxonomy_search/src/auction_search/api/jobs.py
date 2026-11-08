"""Background jobs for the admin API: whitelisted CLI commands, one at a time, with a log and a history.

A job runs ``python -m auction_search.cli <command> <flags>`` in the project folder (so it reads the same
``.env`` and writes the same ``reports/``). Each job has a JSON record and a log file in ``jobs_dir``;
the records survive a restart (a job that was running when the service stopped is marked
``interrupted``). Only commands and flags listed in ``COMMANDS`` can be started.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import uuid
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

VERSION_LABEL = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}$")


@dataclass(frozen=True)
class CommandSpec:
    label: str
    description: str
    flags: dict[str, str] = field(default_factory=dict)   # option name → CLI flag
    needs_version: bool = False


COMMANDS: dict[str, CommandSpec] = {
    "maintain": CommandSpec(
        "Maintain", "Rebuild the search index, reclassify affected lots, embed new lots, then run the regression check."),
    "build-search-index": CommandSpec(
        "Rebuild search index", "Copy new or changed lots into the full-text index.", {"force": "--force"}),
    "classify-lots": CommandSpec(
        "Classify lots", "Classify new or changed lots with the taxonomy.",
        {"force": "--force", "affected": "--affected", "dry_run": "--dry-run"}),
    "build-embeddings": CommandSpec(
        "Compute embeddings", "Embed new or changed lots for the meaning-based search.", {"force": "--force"}),
    "build-taxonomy": CommandSpec(
        "Extract candidates", "Extract new taxonomy candidates from the lots (rules only).", {"dry_run": "--dry-run"}),
    "improve-taxonomy": CommandSpec(
        "Propose improvements", "Propose candidates from the search log and classifications (never approves).",
        {"dry_run": "--dry-run", "extract": "--extract"}),
    "evaluate-search": CommandSpec(
        "Evaluate search", "Run the benchmark and write the evaluation report.", {"save_baseline": "--save-baseline"}),
    "run-regression": CommandSpec(
        "Regression check", "Compare the benchmark with the baseline and check the database rules."),
    "publish-taxonomy": CommandSpec(
        "Publish version", "Check a reviewed draft version and publish it.", {"dry_run": "--dry-run"},
        needs_version=True),
}


class JobError(ValueError):
    """Invalid command or options (HTTP 400)."""


class JobBusy(RuntimeError):
    """Another job is running (HTTP 409)."""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    command: str
    label: str
    options: dict[str, Any]
    argv: list[str]
    status: str = "running"              # running | succeeded | failed | cancelled | interrupted
    exit_code: int | None = None
    started_at: str = field(default_factory=_now)
    finished_at: str | None = None
    pid: int | None = None

    def as_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out.pop("argv")
        out.pop("pid")
        return out


def build_argv(command: str, options: dict[str, Any]) -> list[str]:
    """CLI arguments for a whitelisted command; raises ``JobError`` for anything else."""
    spec = COMMANDS.get(command)
    if spec is None:
        raise JobError(f"unknown command {command!r}")
    args = [command]
    if spec.needs_version:
        version = str(options.get("version") or "")
        if not VERSION_LABEL.match(version):
            raise JobError("a version label such as 0.2.0 is required")
        args.append(version)
    for name, value in options.items():
        if name == "version" and spec.needs_version:
            continue
        if name not in spec.flags:
            raise JobError(f"option {name!r} is not allowed for {command}")
        if not isinstance(value, bool):
            raise JobError(f"option {name!r} must be true or false")
        if value:
            args.append(spec.flags[name])
    return args


class JobRunner:
    def __init__(self, project_root: Path, jobs_dir: Path,
                 launcher: Callable[[list[str]], list[str]] | None = None,
                 on_finish: Callable[[Job], None] | None = None) -> None:
        self.root, self.dir = project_root, jobs_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        # How a command's CLI arguments become a process (replaced in tests).
        self.launcher = launcher or (lambda args: [sys.executable, "-m", "auction_search.cli", "--log-level", "INFO",
                                                   *args])
        self.on_finish = on_finish
        self._lock = threading.Lock()
        self._process: subprocess.Popen[bytes] | None = None
        self._current: Job | None = None
        for job in self.list(limit=1000):  # a job cannot survive a restart of the service
            if job.status == "running":
                job.status, job.finished_at = "interrupted", _now()
                self._save(job)

    # ---- storage ---------------------------------------------------------------------

    def _record(self, job_id: str) -> Path:
        return self.dir / f"{job_id}.json"

    def log_path(self, job_id: str) -> Path:
        return self.dir / f"{job_id}.log"

    def _save(self, job: Job) -> None:
        tmp = self._record(job.id).with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(job)), encoding="utf-8")
        tmp.replace(self._record(job.id))

    def get(self, job_id: str) -> Job | None:
        if not re.fullmatch(r"[0-9]{8}T[0-9]{12}-[0-9a-f]{6}", job_id):
            return None
        path = self._record(job_id)
        if not path.exists():
            return None
        return Job(**json.loads(path.read_text(encoding="utf-8")))

    def list(self, limit: int = 20) -> list[Job]:
        records = sorted(self.dir.glob("*.json"), reverse=True)[:limit]
        return [Job(**json.loads(p.read_text(encoding="utf-8"))) for p in records]

    def running(self) -> Job | None:
        with self._lock:
            return self._current

    def log_tail(self, job_id: str, max_lines: int = 200) -> str:
        path = self.log_path(job_id)
        if not path.exists():
            return ""
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-max_lines:])

    # ---- running ---------------------------------------------------------------------

    def start(self, command: str, options: dict[str, Any] | None = None) -> Job:
        options = dict(options or {})
        args = build_argv(command, options)
        with self._lock:
            if self._current is not None:
                raise JobBusy(f"{self._current.label} is still running")
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%f")  # sortable to the microsecond
            job = Job(f"{stamp}-{uuid.uuid4().hex[:6]}", command, COMMANDS[command].label, options, args)
            log = self.log_path(job.id).open("wb")
            try:
                self._process = subprocess.Popen(self.launcher(args), cwd=self.root, stdout=log,
                                                 stderr=subprocess.STDOUT, env=os.environ.copy())
            except OSError as exc:
                log.close()
                raise JobError(f"could not start {command}: {exc}") from exc
            job.pid = self._process.pid
            self._current = job
            self._save(job)
        threading.Thread(target=self._wait, args=(job, self._process, log), daemon=True).start()
        return job

    def _wait(self, job: Job, process: subprocess.Popen[bytes], log: Any) -> None:
        code = process.wait()
        log.close()
        with self._lock:
            if job.status == "running":
                job.status = "succeeded" if code == 0 else "failed"
            job.exit_code, job.finished_at = code, _now()
            self._save(job)
        # The finish handler (the taxonomy reload) runs before the slot is released, so the next job
        # never starts on a stale taxonomy and "idle" means completely done.
        if self.on_finish is not None:
            try:
                self.on_finish(job)
            except Exception:  # pragma: no cover - a reload failure must not break the runner
                pass
        with self._lock:
            self._current = None
            self._process = None

    def cancel(self, job_id: str) -> Job | None:
        with self._lock:
            if self._current is None or self._current.id != job_id or self._process is None:
                return None
            self._current.status = "cancelled"
            self._process.terminate()
            return self._current

    def wait_idle(self, timeout: float = 30.0) -> bool:
        """For tests: wait until no job is running."""
        import time

        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if self.running() is None:
                return True
            time.sleep(0.05)
        return False
