"""Rule-based lot classification (Phase 4) on a small hand-built taxonomy (no database)."""

from auction_search.database.source import SourceLot
from auction_search.enrichment.classification import Classifier
from auction_search.taxonomy.snapshot import ConceptInfo, TaxonomySnapshot, TermInfo


def _c(i: int, key: str, dim: str, start: int | None = None, end: int | None = None) -> ConceptInfo:
    return ConceptInfo(i, key, dim, 1.0, "candidate", start, end, {})


CONCEPTS = [
    _c(1, "furniture", "category"), _c(2, "furniture.commodes", "object_type"),
    _c(3, "jewellery", "category"), _c(4, "jewellery.rings", "object_type"),
    _c(5, "period.louis_xiv", "period", 1643, 1715), _c(6, "style.louis_xiv", "style"),
    _c(7, "period.19th_century", "period", 1801, 1900), _c(8, "material.gold", "material"),
    _c(9, "maker.boulle", "maker"), _c(10, "decorative_arts", "category"), _c(11, "decorative_arts.boxes", "object_type"),
    _c(12, "fashion", "category"), _c(13, "fashion.heels", "object_type"),
]
TERMS = [
    TermInfo("furniture.commodes", "fr", "Commode", "preferred", False),
    TermInfo("jewellery.rings", "fr", "Bague", "preferred", False),
    TermInfo("period.louis_xiv", "fr", "Louis XIV", "synonym", False),
    TermInfo("style.louis_xiv", "fr", "Style Louis XIV", "preferred", False),
    TermInfo("period.19th_century", "fr", "XIXe siècle", "preferred", False),
    TermInfo("material.gold", "fr", "Or", "preferred", True),
    TermInfo("material.gold", "en", "Gold", "preferred", False),
    TermInfo("maker.boulle", "fr", "Boulle", "preferred", False),
    TermInfo("decorative_arts.boxes", "fr", "Boîte", "preferred", False),
    TermInfo("fashion.heels", "en", "Heels", "preferred", True),
]
RELS = [("broader", "furniture.commodes", "furniture"), ("broader", "jewellery.rings", "jewellery"),
        ("broader", "decorative_arts.boxes", "decorative_arts"), ("broader", "fashion.heels", "fashion"),
        ("originated_in_period", "style.louis_xiv", "period.louis_xiv")]
SNAP = TaxonomySnapshot("draft", 1, {c.key: c for c in CONCEPTS}, TERMS, RELS,
                        {"Commodes": [("furniture.commodes", "classified_as", 1.0)],
                         "Bagues": [("jewellery.rings", "classified_as", 1.0)]})
CL = Classifier(SNAP)


def _lot(title: str, desc: str = "", category: str | None = "Commodes", title_en: str = "", desc_en: str = "") -> SourceLot:
    return SourceLot(1, "drouot", "x", "a", {"fr": title, "en": title_en}, {"fr": desc, "en": desc_en},
                     {"fr": category, "en": None})


def _found(lot: SourceLot) -> set[tuple[str, str]]:
    return {(a.concept_key, a.assertion) for a in CL.classify(lot).assertions}


def test_period_versus_style() -> None:
    assert ("period.louis_xiv", "dated_to") in _found(_lot("Commode d'époque Louis XIV en bois"))
    found = _found(_lot("Commode dans le goût Louis XIV, XIXe siècle"))
    assert ("style.louis_xiv", "in_style_of") in found and ("period.louis_xiv", "dated_to") not in found
    assert ("period.19th_century", "dated_to") in found


def test_source_category_and_positions() -> None:
    desc = "Bois. " + "x " * 200 + "Une commode comparable par Boulle."
    found = {(a.concept_key, a.assertion, a.method, a.position) for a in CL.classify(_lot("Commode galbée", desc)).assertions}
    # one row per concept and assertion: the Drouot category (0.95) wins over the title (0.9)
    assert ("furniture.commodes", "classified_as", "source_category", "category") in found
    assert ("maker.boulle", "mentions", "rule", "note") in found  # deep in the note: evidence only
    found = {(a.concept_key, a.method, a.position) for a in
             CL.classify(_lot("Commode galbée", desc, category=None)).assertions}
    assert ("furniture.commodes", "rule", "title") in found


def test_maker_attribution_context() -> None:
    assert ("maker.boulle", "attributed_to") in _found(_lot("Commode attribuée à Boulle"))
    assert ("maker.boulle", "made_by") in _found(_lot("Commode par Boulle"))


def test_complements_packaging_and_plating_are_not_the_lot() -> None:
    found = _found(_lot("Commode", "Livrée dans sa boîte d'origine.", category=None))
    assert ("decorative_arts.boxes", "mentions") in found and ("decorative_arts.boxes", "classified_as") not in found
    found = _found(_lot("Cadre à bagues", category=None))
    assert ("jewellery.rings", "classified_as") not in found
    found = _found(_lot("Commode", desc_en="Gold-tone metal hardware", title_en="Chest"))
    assert ("material.gold", "made_of") not in found
    found = _found(_lot("Lot de bagues en argent", category=None))
    assert ("jewellery.rings", "classified_as") in found  # after a collective word: the objects themselves


def test_ambiguous_terms_alone_do_not_classify() -> None:
    r = CL.classify(_lot("Fusil", desc_en="The heels of the stock are worn", category=None))
    assert not [a for a in r.assertions if a.concept_key == "fashion.heels" and a.assertion == "classified_as"]
    assert any(reason.startswith("ambiguous term only") for reason in r.reasons)
    found = _found(_lot("Bague or et diamants", title_en="Gold and diamond ring", category="Bagues"))
    assert ("material.gold", "made_of") in found  # 'or' confirmed by the unambiguous 'Gold'


def test_review_reasons() -> None:
    r = CL.classify(_lot("Bague en or", category="Commodes"))
    assert "Drouot category and text disagree" in r.reasons
    r = CL.classify(_lot("Commode d'époque Louis XIV, XIXe siècle", category=None))
    assert any(reason.startswith("conflicting dating") for reason in r.reasons)
    assert CL.classify(_lot("Objet", category=None)).reasons == ["no object classification"]
    assert CL.classify(_lot("Commode Louis XIV", "Bois.")).needs_review is False
