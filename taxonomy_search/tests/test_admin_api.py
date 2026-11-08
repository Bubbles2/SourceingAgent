"""Admin API for the Sourcing agent (token, jobs, review dry runs, reports, settings, status).

Review decisions and imports are sent with ``dryRun: true`` only: they run in a transaction that is
rolled back, and the tests check that nothing changed. Jobs run a harmless stand-in process.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Engine, text

from auction_search.api.jobs import JobError, JobRunner, build_argv
from auction_search.config import PROJECT_ROOT, Settings

TOKEN = "test-service-token"
H = {"X-Service-Token": TOKEN}


def fake_launcher(args: list[str]) -> list[str]:
    """Instead of the CLI: print the arguments, wait a little, exit 0 (or 3 for 'run-regression')."""
    code = 3 if args[0] == "run-regression" else 0
    return [sys.executable, "-c", f"import time; print('ran', {args!r}); time.sleep(0.4); raise SystemExit({code})"]


def test_command_whitelist() -> None:
    assert build_argv("classify-lots", {"affected": True, "force": False}) == ["classify-lots", "--affected"]
    assert build_argv("publish-taxonomy", {"version": "0.2.0", "dry_run": True}) == ["publish-taxonomy", "0.2.0",
                                                                                      "--dry-run"]
    for command, options in [("drop-everything", {}), ("classify-lots", {"limit": True}),
                             ("classify-lots", {"force": "yes"}), ("publish-taxonomy", {}),
                             ("publish-taxonomy", {"version": "0.2.0; rm -rf /"})]:
        with pytest.raises(JobError):
            build_argv(command, options)


def test_job_runner_one_at_a_time(tmp_path: Path) -> None:
    finished: list[str] = []
    runner = JobRunner(PROJECT_ROOT, tmp_path, launcher=fake_launcher, on_finish=lambda j: finished.append(j.id))
    job = runner.start("maintain")
    with pytest.raises(RuntimeError):
        runner.start("build-search-index")
    assert runner.wait_idle(10)
    done = runner.get(job.id)
    assert done is not None and done.status == "succeeded" and done.exit_code == 0
    assert "ran ['maintain']" in runner.log_tail(job.id)
    failed = runner.start("run-regression")
    assert runner.wait_idle(10)
    assert runner.get(failed.id).status == "failed" and finished == [job.id, failed.id]  # type: ignore[union-attr]
    assert [j.id for j in runner.list()] == [failed.id, job.id]
    # a job left "running" by a stopped service is marked interrupted on the next start
    stale = runner.get(job.id)
    assert stale is not None
    stale.status = "running"
    runner._save(stale)
    assert JobRunner(PROJECT_ROOT, tmp_path, launcher=fake_launcher).get(job.id).status == "interrupted"  # type: ignore[union-attr]
    assert runner.get("../../etc/passwd") is None


@pytest.fixture(scope="module")
def admin_client(live_engine: Engine, tmp_path_factory: pytest.TempPathFactory) -> Iterator[Any]:
    testclient = pytest.importorskip("fastapi.testclient")
    from auction_search.api.main import create_app

    jobs_dir = tmp_path_factory.mktemp("jobs")
    settings = Settings(taxonomy_service_token=TOKEN, jobs_dir=jobs_dir)
    app = create_app(settings, semantic=False, log_queries=False,
                     jobs=JobRunner(PROJECT_ROOT, jobs_dir, launcher=fake_launcher))
    with testclient.TestClient(app) as c:
        yield c


pytestmark_db = pytest.mark.integration


@pytestmark_db
def test_token_is_required(admin_client: Any) -> None:
    assert admin_client.get("/api/health").status_code == 200  # health stays open
    assert admin_client.post("/api/search", json={"query": "commode"}).status_code == 401
    assert admin_client.get("/api/admin/status", headers={"X-Service-Token": "wrong"}).status_code == 401
    assert admin_client.post("/api/search", json={"query": "commode", "mode": "exact"}, headers=H).status_code == 200


@pytestmark_db
def test_admin_needs_a_configured_token(live_engine: Engine) -> None:
    testclient = pytest.importorskip("fastapi.testclient")
    from auction_search.api.main import create_app

    with testclient.TestClient(create_app(Settings(taxonomy_service_token=None), semantic=False,
                                          log_queries=False)) as c:
        assert c.get("/api/admin/status").status_code == 503


@pytestmark_db
def test_status_settings_and_default_mode(admin_client: Any) -> None:
    status = admin_client.get("/api/admin/status", headers=H).json()
    assert status["collector"]["lots"] > 0 and status["taxonomyScope"] in ("draft", "published")
    assert {v["label"] for v in status["versions"]} >= {"0.1.0", "0.2.0"}
    assert admin_client.get("/api/admin/settings", headers=H).json()["defaultMode"] == "broad"
    saved = admin_client.put("/api/admin/settings", json={"defaultMode": "exact", "externalMaxRequests": 4},
                             headers=H).json()
    assert saved == {"defaultMode": "exact", "externalMaxRequests": 4}
    assert admin_client.post("/api/search", json={"query": "commode Louis XIV"}, headers=H).json()["mode"] == "exact"
    assert admin_client.put("/api/admin/settings", json={"defaultMode": "fast", "externalMaxRequests": 4},
                            headers=H).status_code == 422


@pytestmark_db
def test_jobs_api(admin_client: Any) -> None:
    assert admin_client.post("/api/admin/jobs", json={"command": "drop-everything"}, headers=H).status_code == 400
    started = admin_client.post("/api/admin/jobs", json={"command": "classify-lots", "options": {"affected": True}},
                                headers=H)
    assert started.status_code == 202
    job_id = started.json()["id"]
    assert admin_client.post("/api/admin/jobs", json={"command": "maintain"}, headers=H).status_code == 409
    import time

    for _ in range(100):
        job = admin_client.get(f"/api/admin/jobs/{job_id}", headers=H).json()
        if job["status"] != "running":
            break
        time.sleep(0.05)
    assert job["status"] == "succeeded" and "--affected" in job["log"]
    assert admin_client.get("/api/admin/jobs", headers=H).json()["jobs"][0]["id"] == job_id
    assert admin_client.get("/api/admin/jobs/nope", headers=H).status_code == 404
    commands = {c["command"] for c in admin_client.get("/api/admin/jobs/commands", headers=H).json()}
    assert {"maintain", "publish-taxonomy", "evaluate-search"} <= commands


@pytestmark_db
def test_review_dry_runs_change_nothing(admin_client: Any, live_engine: Engine, settings: Settings) -> None:
    page = admin_client.get("/api/admin/taxonomy/candidates", params={"version": "0.1.0", "limit": 2},
                            headers=H).json()
    assert page["total"] >= 2 and len(page["items"]) == 2
    key = page["items"][0]["conceptKey"]
    found = admin_client.get("/api/admin/taxonomy/candidates", params={"q": key, "status": "all"}, headers=H).json()
    assert key in {i["conceptKey"] for i in found["items"]}
    s = f'"{settings.app_schema}"'

    def state() -> tuple[str, int]:
        with live_engine.connect() as conn:
            return (conn.execute(text(f"select review_status from {s}.taxonomy_concepts where concept_key = :k"),
                                 {"k": key}).scalar_one(),
                    conn.execute(text(f"select count(*) from {s}.taxonomy_terms where review_status = 'approved'"))
                    .scalar_one())

    before = state()
    result = admin_client.post("/api/admin/taxonomy/decisions", headers=H, json={
        "decisions": [{"conceptKey": key, "decision": "approve", "labelEn": "Changed label"}], "dryRun": True}).json()
    assert result["dryRun"] and result["approved"] == 1 and result["labelsChanged"] == 1
    imported = admin_client.post("/api/admin/taxonomy/import", headers=H, json={
        "csv": f"decision;concept_key\nnon;{key}\nmaybe;{key}\n", "dryRun": True}).json()
    assert imported["rejected"] == 1 and len(imported["invalidRows"]) == 1
    assert state() == before  # rolled back
    assert admin_client.post("/api/admin/taxonomy/import", headers=H,
                             json={"csv": "a,b\n1,2\n"}).status_code == 400
    export = admin_client.get("/api/admin/taxonomy/export.csv", params={"version": "0.1.0"}, headers=H)
    assert export.status_code == 200 and export.text.lstrip("﻿").startswith("decision,concept_key")
    check = admin_client.post("/api/admin/taxonomy/publish/check", json={"version": "9.9.9"}, headers=H).json()
    assert not check["canPublish"]
    assert admin_client.get(f"/api/admin/taxonomy/concepts/{key}", headers=H).status_code == 200


@pytestmark_db
def test_reports_and_quality(admin_client: Any) -> None:
    names = {r["name"] for r in admin_client.get("/api/admin/reports", headers=H).json()}
    assert "search_evaluation" in names
    assert admin_client.get("/api/admin/reports/search_evaluation", headers=H).json()["markdown"].startswith("#")
    assert admin_client.get("/api/admin/reports/..%2F..%2Fpyproject", headers=H).status_code == 404
    assert admin_client.get("/api/admin/reports/Bad.Name", headers=H).status_code == 404
    bench = admin_client.get("/api/admin/benchmark", headers=H).json()
    assert bench["baseline"] is not None and "hybrid_broad" in (bench["latest"] or {})
    log = admin_client.get("/api/admin/search-log", headers=H).json()
    assert isinstance(log["recent"], list) and isinstance(log["unresolved"], list)


@pytestmark_db
def test_admin_tools_do_not_log(admin_client: Any, live_engine: Engine, settings: Settings) -> None:
    s = f'"{settings.app_schema}"'

    def logged() -> tuple[int, int]:
        with live_engine.connect() as conn:
            return (conn.execute(text(f"select count(*) from {s}.search_queries")).scalar_one(),
                    conn.execute(text(f"select count(*) from {s}.external_search_log")).scalar_one())

    before = logged()
    found = admin_client.post("/api/admin/tools/search", json={"query": "commode Louis XIV", "mode": "exact"},
                              headers=H).json()
    assert found["mode"] == "exact" and found["total_direct"] >= 1
    ext = admin_client.post("/api/admin/tools/external", json={"query": "Louis XIV furniture", "maxRequests": 2},
                            headers=H).json()
    assert ext["requests"] and all(" AND " in r["query"] for r in ext["requests"])
    assert logged() == before
