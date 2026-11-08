"""Query understanding, query expansion (Phase 7) and external search (Phase 8) — no database."""

from dataclasses import replace

import pytest

from auction_search.external.base import (
    ProviderError,
    RateLimiter,
    TransientProviderError,
    with_retries,
)
from auction_search.external.mock_provider import MockProvider
from auction_search.external.orchestrator import ExternalSearchOrchestrator
from auction_search.search.criteria import criteria_for, parse_boolean, render_boolean, split_cnf
from auction_search.search.expansion import QueryExpander, core_name
from auction_search.taxonomy.snapshot import ConceptInfo, TaxonomySnapshot, TermInfo


def _c(i: int, key: str, dim: str) -> ConceptInfo:
    return ConceptInfo(i, key, dim, 1.0, "candidate", None, None, {})


CONCEPTS = [_c(1, "furniture", "category"), _c(2, "furniture.commodes", "object_type"),
            _c(3, "period.louis_xiv", "period"), _c(4, "style.louis_xiv", "style"),
            _c(5, "style.french_baroque", "style"), _c(6, "technique.boulle", "technique"),
            _c(7, "fashion.footwear", "subcategory"), _c(8, "fashion.footwear.boots", "object_type"),
            _c(9, "fashion.footwear.ankle_boots", "object_type"), _c(10, "fashion.heels", "object_type"),
            _c(11, "region.france", "region"), _c(12, "style.napoleon_iii", "style"),
            _c(13, "furniture.armchairs", "object_type")]
TERMS = [
    TermInfo("furniture", "fr", "Mobilier", "preferred", False), TermInfo("furniture", "en", "Furniture", "preferred", False),
    TermInfo("furniture", "fr", "Meubles", "synonym", False),
    TermInfo("furniture.commodes", "fr", "Commodes", "preferred", False),
    TermInfo("furniture.commodes", "en", "Commodes", "preferred", False),
    TermInfo("period.louis_xiv", "fr", "Époque Louis XIV", "preferred", False),
    TermInfo("period.louis_xiv", "en", "Louis XIV period", "preferred", False),
    TermInfo("style.louis_xiv", "fr", "Style Louis XIV", "preferred", False),
    TermInfo("style.louis_xiv", "en", "Louis XIV style", "preferred", False),
    TermInfo("style.louis_xiv", "en", "Louis Quatorze style", "synonym", False),
    TermInfo("style.french_baroque", "fr", "Baroque français", "preferred", False),
    TermInfo("style.french_baroque", "en", "French Baroque", "preferred", False),
    TermInfo("technique.boulle", "fr", "Marqueterie Boulle", "preferred", False),
    TermInfo("technique.boulle", "en", "Boulle marquetry", "preferred", False),
    TermInfo("fashion.footwear", "fr", "Chaussures", "preferred", False),
    TermInfo("fashion.footwear", "en", "Shoes", "synonym", False),
    TermInfo("fashion.footwear", "en", "Footwear", "preferred", False),
    TermInfo("fashion.footwear.boots", "fr", "Bottes", "preferred", False),
    TermInfo("fashion.footwear.boots", "en", "Boots", "preferred", False),
    TermInfo("fashion.footwear.ankle_boots", "fr", "Bottines", "preferred", False),
    TermInfo("fashion.footwear.ankle_boots", "en", "Ankle boots", "preferred", False),
    TermInfo("fashion.heels", "en", "Heels", "preferred", True),
    TermInfo("region.france", "en", "French", "synonym", False),
    TermInfo("style.napoleon_iii", "fr", "Style Napoléon III", "preferred", False),
    TermInfo("furniture.armchairs", "fr", "Fauteuils", "preferred", False),
    TermInfo("furniture.armchairs", "en", "Armchairs", "preferred", False),
]
RELS = [("broader", "furniture.commodes", "furniture"), ("broader", "furniture.armchairs", "furniture"),
        ("broader", "style.louis_xiv", "style.french_baroque"),
        ("broader", "fashion.footwear.boots", "fashion.footwear"),
        ("broader", "fashion.footwear.ankle_boots", "fashion.footwear.boots"),
        ("originated_in_period", "style.louis_xiv", "period.louis_xiv"),
        ("associated_technique", "style.louis_xiv", "technique.boulle"),
        ("revival_of", "style.napoleon_iii", "style.louis_xiv")]
SNAP = TaxonomySnapshot("draft", 1, {c.key: c for c in CONCEPTS}, TERMS, RELS, {})


@pytest.fixture
def expander() -> QueryExpander:
    return QueryExpander(SNAP)


def test_understanding_core_names_and_intent(expander: QueryExpander) -> None:
    u = expander.understand("Find Louis XIV furniture")
    assert [(g.text, g.keys) for g in u.groups] == [("Louis XIV", ["period.louis_xiv", "style.louis_xiv"]),
                                                    ("furniture", ["furniture"])]
    assert u.unresolved == [] and u.intent is None
    assert expander.understand("Louis XIV period commode").groups[0].keys == ["period.louis_xiv"]
    assert expander.understand("commode dans le goût Louis XIV").groups[1].keys == ["style.louis_xiv"]
    assert expander.understand("vintage designer shoes").unresolved == ["vintage", "designer"]


def test_expansion_matches_the_brief_example(expander: QueryExpander) -> None:
    plan = expander.expand("Louis XIV furniture", depth="broad", max_queries=40)
    terms = {(q.term, q.relationship, q.priority) for q in plan.queries}
    assert ("Mobilier Louis XIV", "translation", 1) in terms or ("Mobilier Louis XIV", "preferred", 1) in terms
    assert ("Louis Quatorze furniture", "synonym", 1) in terms
    assert any(t == "French Baroque" and r == "broader_style" and p == 2 for t, r, p in terms)
    assert any(t == "Boulle marquetry" and r == "related_technique" and p == 3 for t, r, p in terms)
    assert plan.concepts == ["furniture", "period.louis_xiv", "style.louis_xiv"]


def test_expansion_depths_dedup_limits_cache_and_ambiguity(expander: QueryExpander) -> None:
    exact = {q.term for q in expander.expand("shoes", depth="exact").queries}
    broad = {q.term for q in expander.expand("shoes", depth="broad").queries}
    assert {"Chaussures", "Footwear"} <= exact and "Bottines" not in exact
    assert {"Bottes", "Bottines", "Ankle boots"} <= broad  # narrower, transitively
    explo = expander.expand("Louis XIV style", depth="exploratory", max_queries=50)
    assert any(q.relationship == "revived_by" and q.term == "Style Napoléon III" for q in explo.queries)
    assert "Style Napoléon III" not in {q.term for q in expander.expand("Louis XIV style", depth="broad").queries}
    plan = expander.expand("shoes", depth="broad", max_queries=3)
    assert len(plan.queries) == 3 and len({q.term.lower() for q in plan.queries}) == 3
    assert expander.expand("shoes", depth="broad", max_queries=3).cached
    assert "Heels" not in {q.term for q in expander.expand("heels", depth="broad").queries}
    assert core_name("Reign of Louis XIV") == "Louis XIV" and core_name("Style Louis XIV") == "Louis XIV"


def test_rate_limiter_and_retries() -> None:
    now, slept = [0.0], []
    limiter = RateLimiter(2.0, clock=lambda: now[0], sleep=lambda s: (slept.append(s), now.__setitem__(0, now[0] + s)))
    limiter.wait()
    limiter.wait()
    assert slept == [0.5]
    calls = {"n": 0}

    def flaky() -> str:
        calls["n"] += 1
        if calls["n"] < 3:
            raise TransientProviderError("timeout")
        return "ok"

    assert with_retries(flaky, max_retries=3, sleep=lambda s: None) == "ok" and calls["n"] == 3
    with pytest.raises(TransientProviderError):
        with_retries(lambda: (_ for _ in ()).throw(TransientProviderError("x")), max_retries=1, sleep=lambda s: None)


def test_mock_provider_pagination_or_queries_and_failures() -> None:
    mock = MockProvider()
    assert len(mock.search("boots", "en")) >= 1
    ids = {lot.external_id for lot in mock.search('"bottines" OR "bottes"', "fr")}
    assert {"M001", "M017"} <= ids
    many = mock.search('"cuir"', None)
    assert len(many) > mock.capabilities.page_size  # several pages were followed
    flaky = MockProvider(fail_first=1)
    assert flaky.search("sandales", "fr") and flaky.requests == 2  # one retry
    broken = MockProvider(fail_first=10)
    with pytest.raises(ProviderError):
        broken.search("sandales", "fr")
    assert broken.errors == 1


def test_orchestrator_validates_dedupes_and_attributes(expander: QueryExpander) -> None:
    orch = ExternalSearchOrchestrator({"mock": MockProvider()}, expander, SNAP)
    result = orch.search("Louis XIV furniture", depth="broad", max_queries=30)
    direct = {lot.external_id for lot in result.direct}
    assert {"M006", "M007"} <= direct
    assert all(lot.coverage == 1.0 for lot in result.direct)
    assert all(lot.coverage < 1.0 for lot in result.related)
    assert any(e["direct_matches"] > 0 for e in result.expansions)
    shoes = orch.search("shoes", depth="broad", max_queries=30)
    assert "M016" not in {lot.external_id for lot in shoes.direct}  # rifle "heel": not footwear
    for lot in shoes.direct:
        assert lot.found_by  # attribution kept
    with pytest.raises(KeyError):
        orch.search("shoes", providers=["no_such_provider"])


def test_narrower_expansion_keeps_direct_subtypes_first() -> None:
    # "furniture.tables" sorts after 45 grandchildren of "furniture.case": an alphabetical cut used to drop it.
    concepts = [_c(1, "furniture", "category"), _c(2, "furniture.case", "subcategory"),
                _c(3, "furniture.tables", "subcategory")]
    concepts += [_c(10 + i, f"furniture.case.c{i:02d}", "object_type") for i in range(45)]
    terms = [TermInfo("furniture", "en", "Furniture", "preferred", False),
             TermInfo("furniture.case", "en", "Case furniture", "preferred", False),
             TermInfo("furniture.tables", "en", "Tables", "preferred", False)]
    terms += [TermInfo(f"furniture.case.c{i:02d}", "en", f"Case type {i:02d}", "preferred", False) for i in range(45)]
    rels = [("broader", "furniture.case", "furniture"), ("broader", "furniture.tables", "furniture")]
    rels += [("broader", f"furniture.case.c{i:02d}", "furniture.case") for i in range(45)]
    snap = TaxonomySnapshot("draft", 1, {c.key: c for c in concepts}, terms, rels, {})
    plan = QueryExpander(snap).expand("furniture", language="en", depth="broad", max_queries=100)
    narrower = [q.term for q in plan.queries if q.relationship == "narrower"]
    assert narrower[:2] == ["Case furniture", "Tables"]  # direct sub-types before their own sub-types
    assert len(narrower) == 40  # MAX_NARROWER per concept; the rest are still found by the taxonomy channel


# ---- search criteria for APIs (taxonomy only, no lots) ------------------------------------------

NOT_FURNITURE = {"M019", "M020", "M021", "M022", "M023", "M024"}  # fictitious Louis XIV clocks, vases, frames…


def test_criteria_ideas_core_names_and_boolean(expander: QueryExpander) -> None:
    cr = criteria_for(expander, "Louis XIV furniture", depth="broad")
    louis, furniture = cr.groups
    assert louis.required and furniture.required
    assert louis.words("fr") == ["Louis XIV", "Louis Quatorze"]  # core names cover period and style
    assert {"Style Louis XIV", "Époque Louis XIV"} <= set(louis.covered["fr"])
    assert furniture.words("fr") == ["Mobilier", "Meubles", "Fauteuils", "Commodes"]
    assert furniture.words("en") == ["Furniture", "Armchairs", "Commodes"]  # "Commodes": same word in both languages
    assert cr.boolean("fr") == ('("Louis XIV" OR "Louis Quatorze") AND '
                                '("Mobilier" OR "Meubles" OR "Fauteuils" OR "Commodes")')
    phrases_fr = [t.term for t in cr.phrases["fr"]]
    assert phrases_fr[:4] == ["Mobilier Louis XIV", "Meubles Louis XIV", "Fauteuils Louis XIV", "Commodes Louis XIV"]
    assert "Louis XIV armchairs" in [t.term for t in cr.phrases["en"]]
    # depth decides which words an idea gets, as in the internal search
    assert "French Baroque" not in louis.words("en")
    assert "French Baroque" in criteria_for(expander, "Louis XIV furniture", depth="exploratory").groups[0].words("en")
    assert "Commodes" not in criteria_for(expander, "Louis XIV furniture", depth="exact").groups[1].words("fr")
    # a region only refines the search: not required
    french = criteria_for(expander, "French furniture")
    assert [(g.text, g.required) for g in french.groups] == [("French", False), ("furniture", True)]
    assert "French" not in french.boolean("en")


def test_boolean_syntax_round_trip_and_splitting() -> None:
    cnf = [["Louis XIV", "Louis Quatorze"], [f"Word {i}" for i in range(30)]]
    assert parse_boolean(render_boolean(cnf)) == cnf
    assert parse_boolean('"bottines" OR "bottes"') == [["bottines", "bottes"]]
    assert parse_boolean("boots") == [["boots"]]
    parts = split_cnf(cnf, 120)
    assert len(parts) > 1 and all(len(render_boolean(p)) <= 120 for p in parts)
    assert all(p[0] == cnf[0] for p in parts)  # every request keeps every idea
    assert [w for p in parts for w in p[1]] == cnf[1]  # every keyword once, in order
    assert split_cnf([["x" * 200]], 120) == []  # cannot be shortened: not sent


def test_requests_follow_provider_capabilities(expander: QueryExpander) -> None:
    cr = criteria_for(expander, "Louis XIV furniture")
    with_and = MockProvider().build_requests(cr, "fr")
    assert with_and and all(" AND " in r.query for r in with_and)

    class OrOnly(MockProvider):
        capabilities = replace(MockProvider.capabilities, supports_and=False)

    class Plain(MockProvider):
        capabilities = replace(MockProvider.capabilities, supports_and=False, supports_or=False)

    or_only = OrOnly().build_requests(cr, "fr")
    assert or_only[0].query.startswith('"Mobilier Louis XIV" OR "Meubles Louis XIV"')
    assert all(" AND " not in r.query and len(r.query) <= 120 for r in or_only)
    plain = Plain().build_requests(cr, "fr", max_requests=3)
    assert [r.query for r in plain] == ["Mobilier Louis XIV", "Meubles Louis XIV", "Fauteuils Louis XIV"]


def test_external_search_asks_the_api_for_the_whole_query(expander: QueryExpander) -> None:
    result = ExternalSearchOrchestrator({"mock": MockProvider()}, expander, SNAP).search("Louis XIV furniture")
    assert result.requests and all(" AND " in r["query"] for r in result.requests)
    direct = {lot.external_id for lot in result.direct}
    assert {"M006", "M007", "M025"} <= direct  # M025 "Fauteuil de style Louis XIV": found via a sub-type word
    fetched = direct | {lot.external_id for lot in result.related}
    assert not fetched & NOT_FURNITURE  # the API itself returned no Louis XIV clocks, vases or frames
    assert result.criteria["boolean"]["fr"].startswith('("Louis XIV" OR "Louis Quatorze") AND')
    shoes = ExternalSearchOrchestrator({"mock": MockProvider()}, expander, SNAP).search("shoes")
    assert {"M001", "M002", "M017"} <= {lot.external_id for lot in shoes.direct}  # incl. "Bottines" (a sub-type)
