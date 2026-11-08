"""Administration API used by the Sourcing agent's "Search" admin tab.

Every route needs the service token (``X-Service-Token``, see ``main.py``); the Sourcing agent's back end
adds it after checking that the user is a signed-in administrator. Groups:

* status and settings — what is indexed/classified/embedded, versions, default search mode;
* jobs — whitelisted CLI commands run in the background (``jobs.py``), one at a time;
* taxonomy review — candidates, decisions, CSV export/import, publication check (publication itself is a job);
* quality — reports, benchmark metrics, search log.

Decisions and imports take ``dryRun``: they run in a transaction that is rolled back, and return what
would change. Nothing here deletes data.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from auction_search.api.jobs import COMMANDS, JobBusy, JobError
from auction_search.config import PROJECT_ROOT
from auction_search.taxonomy.review import REVIEW_COLUMNS, ReviewResult, Reviewer, _read_csv

if TYPE_CHECKING:
    from auction_search.api.main import State

REPORT_NAME = re.compile(r"^[a-z0-9_]{1,64}$")
MODES = ("exact", "broad", "exploratory")
DEFAULT_SETTINGS = {"defaultMode": "broad", "externalMaxRequests": 6}


class _Camel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class JobBody(_Camel):
    command: str = Field(min_length=1, max_length=40)
    options: dict[str, bool | str] = Field(default_factory=dict)


class Decision(_Camel):
    concept_key: str = Field(alias="conceptKey", min_length=1, max_length=200)
    decision: Literal["approve", "reject"]
    label_fr: str | None = Field(None, alias="labelFr", max_length=300)
    label_en: str | None = Field(None, alias="labelEn", max_length=300)


class DecisionsBody(_Camel):
    decisions: list[Decision] = Field(min_length=1, max_length=500)
    dry_run: bool = Field(True, alias="dryRun")


class ImportBody(_Camel):
    csv: str = Field(min_length=1, max_length=5_000_000)
    dry_run: bool = Field(True, alias="dryRun")


class PublishCheckBody(_Camel):
    version: str = Field(pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}$")


class ToolSearchBody(_Camel):
    query: str = Field(min_length=1, max_length=500)
    mode: Literal["exact", "broad", "exploratory"] = "broad"
    limit: int = Field(10, ge=1, le=50)


class ToolExternalBody(_Camel):
    query: str = Field(min_length=1, max_length=500)
    search_depth: Literal["exact", "broad", "exploratory"] = Field("broad", alias="searchDepth")
    max_requests: int = Field(6, alias="maxRequests", ge=1, le=50)
    limit: int = Field(10, ge=1, le=50)


class SettingsBody(_Camel):
    default_mode: Literal["exact", "broad", "exploratory"] = Field(alias="defaultMode")
    external_max_requests: int = Field(alias="externalMaxRequests", ge=1, le=50)


# ---- settings file -----------------------------------------------------------------------

def settings_path(state: State) -> Path:
    return state.settings.jobs_dir.parent / "settings.json"


def read_search_settings(state: State) -> dict[str, Any]:
    try:
        stored = json.loads(settings_path(state).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        stored = {}
    out = dict(DEFAULT_SETTINGS)
    if stored.get("defaultMode") in MODES:
        out["defaultMode"] = stored["defaultMode"]
    if isinstance(stored.get("externalMaxRequests"), int) and 1 <= stored["externalMaxRequests"] <= 50:
        out["externalMaxRequests"] = stored["externalMaxRequests"]
    return out


def _review_result(result: ReviewResult, dry_run: bool) -> dict[str, Any]:
    return {"dryRun": dry_run, "approved": result.approved, "rejected": result.rejected,
            "labelsChanged": result.labels_changed, "termsUpdated": result.terms_updated,
            "relationshipsUpdated": result.relationships_updated, "unknownKeys": result.unknown_keys,
            "invalidRows": result.invalid_rows}


def create_admin_router(get_state: Callable[[], State]) -> APIRouter:
    router = APIRouter(prefix="/api/admin")

    def schema(state: State) -> str:
        return f'"{state.settings.app_schema}"'

    # ---- status and settings ---------------------------------------------------------------

    @router.get("/status")
    def status() -> dict[str, Any]:
        st = get_state()
        s, src = schema(st), f'"{st.settings.db_schema}"'
        with st.ro.connect() as conn:
            counts = conn.execute(text(
                f"select (select count(*) from {src}.lots) as collector_lots, "
                f"(select count(*) from {src}.auctions) as collector_auctions, "
                f"(select max(updated_at) from {src}.lots) as last_collected, "
                f"(select count(*) from {s}.lot_classification_state) as classified, "
                f"(select count(*) from {s}.lot_classification_state where needs_review) as flagged, "
                f"(select max(classified_at) from {s}.lot_classification_state) as last_classified, "
                f"(select count(*) from {s}.lot_search_documents) as indexed, "
                f"(select max(updated_at) from {s}.lot_search_documents) as last_indexed, "
                f"(select count(*) from {s}.lot_embeddings where model = :m) as embedded, "
                f"(select max(created_at) from {s}.lot_embeddings where model = :m) as last_embedded, "
                f"(select count(*) from {s}.search_queries) as searches"),
                {"m": st.settings.embedding_model}).mappings().one()
            versions = [dict(r) for r in conn.execute(text(
                f"select v.label, v.status, v.created_at, v.published_at, "
                f"(select count(*) from {s}.taxonomy_concepts c where c.introduced_in_version_id = v.id) as concepts, "
                f"(select count(*) from {s}.taxonomy_concepts c where c.introduced_in_version_id = v.id "
                f" and c.review_status = 'candidate') as candidates, "
                f"(select count(*) from {s}.taxonomy_concepts c where c.introduced_in_version_id = v.id "
                f" and c.review_status = 'approved') as approved, "
                f"(select count(*) from {s}.taxonomy_concepts c where c.introduced_in_version_id = v.id "
                f" and c.review_status = 'rejected') as rejected, "
                f"(select count(*) from {s}.taxonomy_relationships r where r.introduced_in_version_id = v.id) "
                f" as relationships from {s}.taxonomy_versions v order by v.id")).mappings()]
        published = next((v["label"] for v in versions if v["status"] == "published"), None)
        running = st.jobs.running()
        return {
            "taxonomyScope": st.snap.scope, "publishedVersion": published, "concepts": len(st.snap.concepts),
            "embeddingModel": st.settings.embedding_model,
            "collector": {"auctions": counts["collector_auctions"], "lots": counts["collector_lots"],
                          "lastCollected": counts["last_collected"]},
            "classification": {"lots": counts["classified"], "flagged": counts["flagged"],
                               "lastRun": counts["last_classified"]},
            "index": {"lots": counts["indexed"], "lastRun": counts["last_indexed"]},
            "embeddings": {"lots": counts["embedded"], "lastRun": counts["last_embedded"]},
            "searches": counts["searches"],
            "versions": [{"label": v["label"], "status": v["status"], "createdAt": v["created_at"],
                          "publishedAt": v["published_at"], "concepts": v["concepts"], "candidates": v["candidates"],
                          "approved": v["approved"], "rejected": v["rejected"], "relationships": v["relationships"]}
                         for v in versions],
            "runningJob": running.as_dict() if running else None,
        }

    @router.get("/settings")
    def get_settings_() -> dict[str, Any]:
        return read_search_settings(get_state())

    @router.put("/settings")
    def put_settings(body: SettingsBody) -> dict[str, Any]:
        st = get_state()
        path = settings_path(st)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"defaultMode": body.default_mode,
                                    "externalMaxRequests": body.external_max_requests}), encoding="utf-8")
        return read_search_settings(st)

    # ---- jobs ------------------------------------------------------------------------------

    @router.get("/jobs/commands")
    def job_commands() -> list[dict[str, Any]]:
        return [{"command": name, "label": spec.label, "description": spec.description,
                 "options": sorted(spec.flags), "needsVersion": spec.needs_version} for name, spec in COMMANDS.items()]

    @router.get("/jobs")
    def list_jobs(limit: int = Query(20, ge=1, le=100)) -> dict[str, Any]:
        jobs = get_state().jobs
        running = jobs.running()
        return {"running": running.as_dict() if running else None, "jobs": [j.as_dict() for j in jobs.list(limit)]}

    @router.post("/jobs", status_code=202)
    def start_job(body: JobBody) -> dict[str, Any]:
        try:
            job = get_state().jobs.start(body.command, dict(body.options))
        except JobError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except JobBusy as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return job.as_dict()

    @router.get("/jobs/{job_id}")
    def get_job(job_id: str, lines: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
        jobs = get_state().jobs
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job not found")
        return job.as_dict() | {"log": jobs.log_tail(job_id, lines)}

    @router.post("/jobs/{job_id}/cancel")
    def cancel_job(job_id: str) -> dict[str, Any]:
        job = get_state().jobs.cancel(job_id)
        if job is None:
            raise HTTPException(status_code=409, detail="this job is not running")
        return job.as_dict()

    # ---- taxonomy review -------------------------------------------------------------------

    @router.get("/taxonomy/candidates")
    def candidates(status: Literal["candidate", "approved", "rejected", "all"] = "candidate",
                   dimension: str | None = Query(None, max_length=40),
                   provenance: str | None = Query(None, max_length=40),
                   version: str | None = Query(None, max_length=20),
                   min_confidence: float | None = Query(None, alias="minConfidence", ge=0, le=1),
                   q: str | None = Query(None, max_length=100),
                   limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)) -> dict[str, Any]:
        st = get_state()
        with st.ro.connect() as conn:
            rows = Reviewer(conn, st.settings.app_schema).list(
                None if status == "all" else status, dimension or None, provenance or None, version or None,
                min_confidence)
        if q:
            needle = q.casefold()
            rows = [r for r in rows if any(needle in str(r.get(k) or "").casefold()
                                           for k in ("concept_key", "label_fr", "label_en", "example"))]
        page = rows[offset:offset + limit]
        return {"total": len(rows), "limit": limit, "offset": offset, "items": [
            {"conceptKey": r["concept_key"], "dimension": r["dimension"], "labelFr": r["label_fr"],
             "labelEn": r["label_en"], "broader": r["broader"], "confidence": float(r["confidence"] or 0),
             "lots": r["lots"], "auctions": r["auctions"], "ambiguousLots": r["ambiguous_lots"],
             "topCategories": r["top_categories"], "englishInData": r["english_in_data"],
             "provenance": r["provenance"], "version": r["version"], "status": r["status"], "example": r["example"]}
            for r in page]}

    @router.get("/taxonomy/concepts/{key}")
    def concept(key: str) -> dict[str, Any]:
        st = get_state()
        if len(key) > 200:
            raise HTTPException(status_code=404, detail="concept not found")
        with st.ro.connect() as conn:
            details = Reviewer(conn, st.settings.app_schema).store.describe(key)
        if details is None:
            raise HTTPException(status_code=404, detail="concept not found")
        return json.loads(json.dumps(details, default=str))

    def _apply(rows: list[dict[str, str]], dry_run: bool) -> dict[str, Any]:
        st = get_state()
        with st.rw_engine().connect() as conn:
            trans = conn.begin()
            try:
                result = Reviewer(conn, st.settings.app_schema).apply_rows(rows)
            except Exception:
                trans.rollback()
                raise
            (trans.rollback if dry_run else trans.commit)()
        if not dry_run and (result.approved or result.rejected or result.labels_changed):
            st.reload()
        return _review_result(result, dry_run)

    @router.post("/taxonomy/decisions")
    def decisions(body: DecisionsBody) -> dict[str, Any]:
        rows = [{"decision": d.decision, "concept_key": d.concept_key, "label_fr": d.label_fr or "",
                 "label_en": d.label_en or ""} for d in body.decisions]
        return _apply(rows, body.dry_run)

    @router.post("/taxonomy/import")
    def import_csv(body: ImportBody) -> dict[str, Any]:
        st = get_state()
        tmp = st.settings.jobs_dir.parent / "review-import.csv"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(body.csv, encoding="utf-8")
        try:
            rows = _read_csv(tmp)
        finally:
            tmp.unlink(missing_ok=True)
        if not rows or not {"decision", "concept_key"} <= set(rows[0]):
            raise HTTPException(status_code=400, detail="the file needs the columns decision and concept_key")
        return _apply(rows, body.dry_run)

    @router.get("/taxonomy/export.csv")
    def export_csv(status: Literal["candidate", "approved", "rejected", "all"] = "candidate",
                   version: str | None = Query(None, max_length=20)) -> Response:
        st = get_state()
        with st.ro.connect() as conn:
            rows = Reviewer(conn, st.settings.app_schema).list(None if status == "all" else status, None, None,
                                                               version or None)
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=REVIEW_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        name = f"review_{version or 'all'}_{status}.csv"
        return Response("﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})

    @router.post("/taxonomy/publish/check")
    def publish_check(body: PublishCheckBody) -> dict[str, Any]:
        st = get_state()
        with st.ro.connect() as conn:
            issues = Reviewer(conn, st.settings.app_schema).publication_issues(body.version)
        return {"version": body.version, "canPublish": not any(i.level == "error" for i in issues),
                "issues": [{"level": i.level, "message": i.message} for i in issues]}

    # ---- search tools (admin tests: never recorded in the search logs) ------------------------

    @router.post("/tools/search")
    def tool_search(body: ToolSearchBody) -> dict[str, Any]:
        st = get_state()
        resp = st.search.search(body.query, mode=body.mode, limit=body.limit, log_query=False)
        out = resp.as_dict()
        out["taxonomyScope"] = out.pop("taxonomy_scope")
        return out

    @router.post("/tools/external")
    def tool_external(body: ToolExternalBody) -> dict[str, Any]:
        from auction_search.external.orchestrator import default_orchestrator

        st = get_state()
        orchestrator = default_orchestrator(st.snap, st.search.expander, st.ro, None, st.settings)  # no log engine
        return orchestrator.search(body.query, depth=body.search_depth, max_requests=body.max_requests,
                                   limit=body.limit).as_dict()

    # ---- quality ---------------------------------------------------------------------------

    def reports_dir() -> Path:
        return get_state().settings.reports_dir

    @router.get("/reports")
    def reports() -> list[dict[str, Any]]:
        out = []
        for path in sorted(reports_dir().glob("*.md")):
            if REPORT_NAME.match(path.stem):
                first = path.read_text(encoding="utf-8", errors="replace").split("\n", 1)[0]
                out.append({"name": path.stem, "title": first.lstrip("# ").strip() or path.stem,
                            "modified": path.stat().st_mtime, "size": path.stat().st_size})
        return out

    @router.get("/reports/{name}")
    def report(name: str) -> dict[str, Any]:
        path = reports_dir() / f"{name}.md"
        if not REPORT_NAME.match(name) or not path.is_file():
            raise HTTPException(status_code=404, detail="report not found")
        return {"name": name, "markdown": path.read_text(encoding="utf-8", errors="replace")}

    @router.get("/benchmark")
    def benchmark() -> dict[str, Any]:
        bench = PROJECT_ROOT / "data" / "benchmark"

        def load(path: Path) -> Any:
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                return None

        latest = load(reports_dir() / "search_evaluation.json")
        regression = load(reports_dir() / "regression.json")
        labels = bench / "human_labels.csv"
        return {"baseline": load(bench / "baseline_metrics.json"),
                "latest": (latest or {}).get("summary"),
                "humanLabels": max(0, len(labels.read_text(encoding="utf-8").splitlines()) - 1) if labels.exists() else 0,
                "regression": regression}

    @router.get("/search-log")
    def search_log(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
        st = get_state()
        s = schema(st)
        with st.ro.connect() as conn:
            recent = [dict(r) for r in conn.execute(text(
                f"select query, mode, language, results, direct_results, took_ms, unresolved_terms, created_at "
                f"from {s}.search_queries order by created_at desc limit :n"), {"n": limit}).mappings()]
            unresolved = [{"term": t, "searches": n} for t, n in conn.execute(text(
                f"select t, count(*) from {s}.search_queries, unnest(unresolved_terms) t "
                f"group by t order by 2 desc, 1 limit 50"))]
        return {"recent": [{"query": r["query"], "mode": r["mode"], "language": r["language"], "results": r["results"],
                            "directResults": r["direct_results"], "tookMs": r["took_ms"],
                            "unresolvedTerms": list(r["unresolved_terms"] or []), "createdAt": r["created_at"]}
                           for r in recent], "unresolved": unresolved}

    return router
