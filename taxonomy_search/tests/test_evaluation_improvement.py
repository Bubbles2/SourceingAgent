"""Phase 9 metrics/labels (no database) and Phase 10 improvement proposals (rolled-back sandbox)."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from auction_search.database.source import SourceLot
from auction_search.search.evaluation import load_queries, metrics, relevant_sets, rule_matches
from auction_search.taxonomy.improvement import ImprovementResult, TaxonomyImprover, affected_lots
from auction_search.taxonomy.snapshot import TaxonomySnapshot
from auction_search.taxonomy.store import TaxonomyStore
from tests.conftest import PYTEST_SANDBOX


def _lot(i: int, cat: str, title: str, desc: str = "") -> SourceLot:
    return SourceLot(i, "drouot", str(i), "a", {"fr": title, "en": ""}, {"fr": desc, "en": ""}, {"fr": cat, "en": None})


def test_metrics() -> None:
    m = metrics([1, 2, 3, 4], {1, 3, 9})
    assert m["precision@10"] == 0.2 and m["mrr"] == 1.0 and m["recall@50"] == pytest.approx(2 / 3)
    assert 0 < m["ndcg@10"] < 1
    assert metrics([], {1})["mrr"] == 0.0 and metrics([5], set())["recall@50"] == 0.0


def test_rules_and_human_overrides() -> None:
    rule = {"categories": ["Commodes"], "text": "[ée]poque\\s+louis\\s*xiv"}
    yes, no = _lot(1, "Commodes", "Commode d'époque Louis XIV"), _lot(2, "Commodes", "Commode de style Louis XIV")
    assert rule_matches(rule, yes, yes.title["fr"], yes.title["fr"])
    assert not rule_matches(rule, no, no.title["fr"], no.title["fr"])
    alt = {"any": [{"categories": ["Chaussures"]}, {"title": "\\bbottines?\\b"}]}
    assert rule_matches(alt, _lot(3, "Vêtements", "Bottines"), "Bottines", "Bottines")
    q = [q for q in load_queries() if q.id == "q03"]
    rel = relevant_sets(q, [yes, no], {("q03", 2): True, ("q03", 1): False})
    assert rel["q03"] == {2}  # human labels win over the rule


def test_benchmark_file_is_well_formed() -> None:
    queries = load_queries()
    assert len(queries) == 20 and len({q.id for q in queries}) == 20
    assert {q.language for q in queries} == {"en", "fr"}


@pytest.mark.integration
def test_improvement_proposals_and_affected_lots(store: TaxonomyStore) -> None:
    conn, s = store.conn, f'"{PYTEST_SANDBOX}"'
    vid = conn.execute(text(f"select min(id) from {s}.taxonomy_versions")).scalar_one()
    # an unreviewed extracted candidate, and a search log in which people asked for it
    cid = conn.execute(text(
        f"insert into {s}.taxonomy_concepts (concept_key, dimension, provenance, introduced_in_version_id) values "
        f"('material.soie_test', 'material', 'rule_extraction', :v) returning id"), {"v": vid}).scalar_one()
    conn.execute(text(f"insert into {s}.taxonomy_terms (concept_id, concept_dimension, language, term, normalized, "
                      f"term_type, provenance, introduced_in_version_id) values (:c, 'material', 'fr', 'Soie test', "
                      f"'soie test', 'preferred', 'rule_extraction', :v)"), {"c": cid, "v": vid})
    conn.execute(text(f"insert into {s}.search_queries (query, mode, unresolved_terms, results, direct_results, "
                      f"took_ms) values ('soie test', 'broad', '{{soie,test}}', 0, 0, 1)"))
    # classified lots: Louis XIV style + marble together far more often than chance
    concepts = dict(conn.execute(text(f"select concept_key, id from {s}.taxonomy_concepts")).all())
    rows = []
    for lot in range(1, 13):
        pairs = ([("style.louis_xiv", "style", "in_style_of"), ("material.marble", "material", "made_of")] if lot <= 3
                 else [("style.louis_xv", "style", "in_style_of")] if lot <= 7 else [("material.wood", "material", "made_of")])
        rows += [{"lot": lot, "c": concepts[k], "d": d, "a": a, "v": vid} for k, d, a in pairs]
    conn.execute(text(f"insert into {s}.lot_concepts (lot_id, source, source_lot_id, concept_id, concept_dimension, "
                      f"assertion, confidence, method, taxonomy_version_id) values (:lot, 'drouot', 'x', :c, :d, :a, 0.9, "
                      f"'rule', :v)"), rows)

    snap = TaxonomySnapshot.load(conn, PYTEST_SANDBOX, "draft")
    assert "material.soie_test" not in snap.concepts  # unreviewed extracted candidates are not used
    improver = TaxonomyImprover(conn, PYTEST_SANDBOX, snap)
    result = ImprovementResult("0.3.0-test")
    terms = improver.unresolved_terms()
    improver.search_demand(result, terms, dry_run=False)
    assert result.demand_marked == {"soie test": "material.soie_test"}
    demand = conn.execute(text(f"select attributes->>'search_demand' from {s}.taxonomy_concepts where id = :c"),
                          {"c": cid}).scalar()
    assert demand == "1"
    improver.cooccurrence_relationships(result)
    assert {(p["source"], p["type"], p["target"]) for p in result.relationships_proposed} == {
        ("style.louis_xiv", "associated_material", "material.marble")}
    improver.write_proposals(result)
    status = conn.execute(text(
        f"select review_status, provenance from {s}.taxonomy_relationships where notes like 'co-occurs%'")).all()
    assert status == [("candidate", "search_feedback")]  # a proposal, never approved automatically

    since = conn.execute(text("select now() - interval '1 second'")).scalar()
    affected = affected_lots(conn, PYTEST_SANDBOX, since)
    assert {1, 2, 3} <= affected  # lots classified under the concepts that just got a new relationship
