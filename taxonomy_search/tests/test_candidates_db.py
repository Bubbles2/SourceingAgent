"""Phase 3 against the real database: extraction job (cache, resume), import, review, publish.

Import/review/publish run in the rolled-back sandbox (``conftest.sandbox_store``); the extraction job
only reads ``drouot_collector`` and writes to a temporary directory.
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest
from sqlalchemy import Engine, text

from auction_search.config import Settings
from auction_search.database.inspection import build_structure_report
from auction_search.enrichment.extraction import Gazetteer, LotExtraction, load_extractions, run_extraction
from auction_search.taxonomy.builder import Attestation, BuildResult, Candidate, Evidence
from auction_search.taxonomy.importer import CandidateImporter
from auction_search.taxonomy.review import Reviewer
from auction_search.taxonomy.store import TaxonomyStore
from tests.conftest import PYTEST_SANDBOX

pytestmark = pytest.mark.integration


def test_extraction_job_cache_and_resume(live_engine: Engine, settings: Settings, tmp_path: Path) -> None:
    structure = build_structure_report(live_engine, settings.db_schema, settings.app_schema, "t")
    with live_engine.connect() as conn:
        gaz = Gazetteer.from_database(conn, settings.app_schema) if TaxonomyStore(
            conn, settings.app_schema).schema_ready() else Gazetteer([])
    first = run_extraction(live_engine, structure, gaz, tmp_path, limit=120, batch_size=50)
    assert first.lots_processed == 120 and first.extracted + first.duplicate_content_reused == 120
    again = run_extraction(live_engine, structure, gaz, tmp_path, limit=120, batch_size=50)
    assert again.cache_hits == 120 and again.extracted == 0

    # Simulate an interrupted run: keep the first 50 records as a partial file, then resume.
    records = (tmp_path / "lots.jsonl").read_text(encoding="utf-8").splitlines()
    (tmp_path / "lots.jsonl.partial").write_text("\n".join(records[:50]) + "\n", encoding="utf-8")
    resumed = run_extraction(live_engine, structure, gaz, tmp_path, limit=120, batch_size=50, resume=True)
    assert resumed.resumed_from_lot_id == LotExtraction.from_json(records[49]).lot_id
    assert resumed.lots_processed == 120 and resumed.cache_hits == 70
    assert [r.lot_id for r in load_extractions(tmp_path)] == [LotExtraction.from_json(r).lot_id for r in records]


def _evidence(lot: int) -> Evidence:
    return Evidence(lot, "drouot", f"s{lot}", "a1", "title_fr", f"quote {lot}", "object_head")


def _build() -> BuildResult:
    mules = Candidate("fashion.footwear.mules_test", "object_type", "Mules (test)", "Mules (test)", "alignment", 0.8,
                      "mule test", 12, 4, 0.6, {"object_head": 12}, broader="fashion.footwear",
                      broader_reason="test", evidence=[_evidence(1), _evidence(2)], lot_ids=[1, 2])
    no_en = Candidate("material.test_only", "material", "Matière test", None, None, None, "matiere test", 5, 2,
                      0.45, {"material_en": 5}, evidence=[_evidence(3)], lot_ids=[3])
    weak = Candidate("object_type.weak_test", "object_type", "Faible", "Weak", "alignment", 0.3, "faible", 3, 1,
                     0.2, {"object_head": 3}, lot_ids=[4])
    attested = Attestation("fashion.footwear.boots", "object_type", 2, 2, {"gazetteer": 2}, 0, [], {},
                           [Evidence(5, "drouot", "s5", "a2", "title_fr", "Paire de bottes", "gazetteer")], [5])
    return BuildResult("now", {}, 10, [mules, no_en, weak], [attested], {}, {}, [], [])


def test_import_review_publish(store: TaxonomyStore, tmp_path: Path) -> None:
    conn = store.conn
    importer = CandidateImporter(conn, PYTEST_SANDBOX)
    result = importer.run(_build(), version_label="0.2.0-test", min_confidence=0.4)
    assert (result.concepts_inserted, result.below_min_confidence) == (2, 1)
    assert result.relationships_inserted == 1 and result.evidence_inserted == 4

    again = importer.run(_build(), version_label="0.2.0-test", min_confidence=0.4)
    assert (again.concepts_inserted, again.concepts_refreshed, again.evidence_inserted) == (0, 2, 0)

    q = conn.execute
    t = store._t
    status = dict(q(text(f"select concept_key, review_status from {t('taxonomy_concepts')} "
                         f"where provenance = 'rule_extraction'")).all())
    assert status == {"fashion.footwear.mules_test": "candidate", "material.test_only": "candidate"}

    reviewer = Reviewer(conn, PYTEST_SANDBOX)
    listed = {r["concept_key"]: r for r in reviewer.list(provenance="rule_extraction")}
    assert listed["fashion.footwear.mules_test"]["broader"] == "fashion.footwear"
    assert listed["material.test_only"]["label_en"] is None
    # An attested seed concept shows its real occurrence count, not the 5-quote evidence cap.
    assert result.attestations_recorded == 1
    boots = {r["concept_key"]: r for r in reviewer.list(version="0.1.0")}["fashion.footwear.boots"]
    assert (boots["lots"], boots["auctions"], boots["ambiguous_lots"]) == (2, 2, 0)

    # Approving a concept approves its labels; its 'broader' link waits until the parent is approved too.
    r = reviewer.set_status(["fashion.footwear.mules_test"], "approve")
    assert (r.approved, r.terms_updated, r.relationships_updated) == (1, 2, 0)
    r = reviewer.set_status(["fashion.footwear"], "approve")
    assert r.relationships_updated == 1  # now both ends are approved

    # CSV round trip: a reviewer approves the material and supplies the missing English label.
    csv_path = tmp_path / "review.csv"
    Reviewer.export_csv(reviewer.list(provenance="rule_extraction", status="candidate"), csv_path)
    with csv_path.open(newline="", encoding="utf-8") as fh:
        data = list(csv.DictReader(fh))
    for row in data:
        if row["concept_key"] == "material.test_only":
            row["decision"], row["label_en"] = "approve", "Test material"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(data[0]))
        writer.writeheader()
        writer.writerows(data)
    applied = reviewer.apply_csv(csv_path)
    assert (applied.approved, applied.labels_changed) == (1, 1)
    labels = dict(q(text(f"select language, term from {t('taxonomy_terms')} tt join {t('taxonomy_concepts')} c "
                         f"on c.id = tt.concept_id where c.concept_key = 'material.test_only'")).all())
    assert labels == {"fr": "Matière test", "en": "Test material"}

    # Publishing is refused while approved concepts depend on unapproved ones, then succeeds.
    reviewer.set_status(["fashion"], "approve")
    blocking = [i for i in reviewer.publication_issues("0.2.0-test") if i.level == "error"]
    assert blocking == [], [i.message for i in blocking]
    assert reviewer.publish("0.2.0-test") == []
    published = {k for (k,) in q(text(f"select concept_key from {t('published_concepts')}"))}
    assert {"fashion.footwear.mules_test", "material.test_only", "fashion.footwear", "fashion"} <= published
    assert "fashion.footwear.boots" not in published  # still a candidate from the seed

    # Rejecting removes it from the published views (it stays in the table, rejected).
    reviewer.set_status(["material.test_only"], "reject")
    published = {k for (k,) in q(text(f"select concept_key from {t('published_concepts')}"))}
    assert "material.test_only" not in published


def test_review_file_from_a_french_spreadsheet(store: TaxonomyStore, tmp_path: Path) -> None:
    """Excel (French settings) saves with ';', Windows-1252 and may write 'Approuvé'."""
    CandidateImporter(store.conn, PYTEST_SANDBOX).run(_build(), version_label="0.2.0-fr", min_confidence=0.4)
    exported = tmp_path / "export.csv"
    Reviewer.export_csv(Reviewer(store.conn, PYTEST_SANDBOX).list(provenance="rule_extraction"), exported, ";")
    assert exported.read_bytes().startswith(b"\xef\xbb\xbf")  # BOM: accents display correctly in Excel
    path = tmp_path / "excel.csv"
    path.write_bytes("decision;concept_key;label_fr;label_en\nApprouvé;material.test_only;Matière test;Test material\n"
                     "Non;fashion.footwear.mules_test;;\n".encode("cp1252"))
    result = Reviewer(store.conn, PYTEST_SANDBOX).apply_csv(path)
    assert (result.approved, result.rejected, result.labels_changed, result.invalid_rows) == (1, 1, 1, [])


def test_publication_blocked_by_missing_label(store: TaxonomyStore) -> None:
    importer = CandidateImporter(store.conn, PYTEST_SANDBOX)
    importer.run(_build(), version_label="0.2.0-test2", min_confidence=0.4)
    reviewer = Reviewer(store.conn, PYTEST_SANDBOX)
    reviewer.set_status(["material.test_only"], "approve")  # approved without an English label
    issues = reviewer.publish("0.2.0-test2")
    assert any("material.test_only" in i.message and "'en'" in i.message for i in issues)
    assert store.conn.execute(text(f"select count(*) from {store._t('taxonomy_current_version')}")).scalar() == 0
