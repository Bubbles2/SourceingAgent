"""Candidate building on synthetic extraction records (no database)."""

from auction_search.enrichment.extraction import Gazetteer, LotExtraction, Mention
from auction_search.taxonomy.builder import Aligner, ExistingTaxonomy, build_candidates

GAZ = Gazetteer.from_rows([
    ("fashion.footwear", "subcategory", "fr", "Chaussures", "preferred", False),
    ("fashion.footwear", "subcategory", "en", "Footwear", "preferred", False),
    ("material.bronze", "material", "fr", "Bronze", "preferred", False),
    ("period.louis_xv", "period", "fr", "Époque Louis XV", "preferred", False),
])
EXISTING = ExistingTaxonomy(
    keys={"fashion.footwear": "subcategory", "material.bronze": "material", "period.louis_xv": "period",
          "world_arts.asian_art": "subcategory"},
    by_lemma={("fr", "chaussure"): {"fashion.footwear"}, ("fr", "bronze"): {"material.bronze"},
              ("fr", "epoque louis xv"): {"period.louis_xv"}},
    en_labels={"fashion.footwear": ["Footwear"]},
    category_map={"Chaussures": [("fashion.footwear", "classified_as")],
                  "Arts d'Asie": [("world_arts.asian_art", "classified_as")]},
)


def _m(extractor: str, dim: str, label: str, key: str, **kw: object) -> Mention:
    return Mention(extractor, dim, "fr", "title_fr", label, key, 0, len(label), f"…{label}…", **kw)  # type: ignore[arg-type]


def _rec(i: int, mentions: list[Mention], en: str, category: str = "Chaussures", auction: str | None = None) -> LotExtraction:
    return LotExtraction(i, "drouot", f"s{i}", auction or f"a{i % 3}", category, None, f"h{i}", "fp", mentions, en,
                         [], en)


def _records() -> list[LotExtraction]:
    recs = []
    for i in range(6):  # 'Mules' in the shoes category, English 'mules'
        recs.append(_rec(i, [_m("object_head", "object_type", "Mules", "mule")], "pair of mule in black leather"))
    for i in range(6, 10):  # a style and its period
        recs.append(_rec(i, [_m("style", "style", "Style Louis XV", "style louis xv", label_en="Louis XV style")],
                         "louis xv style commode", category="Commodes"))
    for i in range(10, 14):  # 'Bronze' as object head collides with an existing material
        recs.append(_rec(i, [_m("object_head", "object_type", "Bronze", "bronze")], "bronze figure", "Bronzes"))
    for i in range(14, 16):  # below the lot threshold
        recs.append(_rec(i, [_m("object_head", "object_type", "Babouche", "babouche")], "babouche", "Chaussures"))
    for i in range(16, 21):  # bowls sold in a culture department
        recs.append(_rec(i, [_m("object_head", "object_type", "Bol", "bol")], "porcelain bowl", "Arts d'Asie"))
    for i in range(21, 25):  # a brand, also seen as an object head
        recs.append(_rec(i, [_m("brand_header", "maker", "Gucci", "gucci", assertion="made_by"),
                             _m("object_head", "object_type", "Gucci", "gucci")], "gucci loafers", "Chaussures"))
    for i in range(25, 29):  # a place heading one catalogue
        recs.append(_rec(i, [_m("brand_header", "maker", "Echternach", "echternach")], "photographs", "Photos",
                         auction="one"))
    recs.append(_rec(29, [_m("gazetteer", "subcategory", "Chaussures", "fashion.footwear",
                             concept_key="fashion.footwear")], "shoes"))
    # Background text, as in a real catalogue: common words are not translations.
    recs += [_rec(100 + i, [], "pair of black leather gloves louis style commode figure", "Divers", f"b{i % 4}")
             for i in range(40)]
    return recs


def test_build_candidates_rules() -> None:
    result = build_candidates(_records(), GAZ, EXISTING, min_lots=3)
    by_key = {c.key: c for c in result.candidates}

    mules = by_key["fashion.footwear.mule"]
    assert (mules.label_fr, mules.label_en, mules.en_source) == ("Mules", "Mule", "alignment")
    assert mules.broader == "fashion.footwear" and "Chaussures" in (mules.broader_reason or "")

    style = by_key["style.louis_xv"]
    assert style.label_en == "Louis XV style" and ("originated_in_period", "period.louis_xv") in style.relationships

    bol = by_key["object_type.bol"]
    assert bol.broader is None  # culture departments are never parents

    assert "maker.gucci" in by_key and not any(c.dimension == "object_type" and c.lemma == "gucci"
                                               for c in result.candidates)
    assert "maker.echternach" not in by_key
    assert not any(c.lemma in ("bronze", "babouche") for c in result.candidates)
    assert result.below_threshold == {"object_type": 1}
    assert result.dropped["object_type: label belongs to an existing concept of another dimension"] == 1
    assert {a.concept_key for a in result.attested} == {"fashion.footwear"}
    assert all(0 < c.confidence <= 1 for c in result.candidates)
    assert all(len(c.evidence) <= 5 and c.lot_ids for c in result.candidates)


def test_aligner_prefers_specific_bigram_and_needs_two_auctions() -> None:
    recs = [_rec(i, [], "chinese snuff bottle with stopper", auction=f"a{i % 2}") for i in range(6)]
    recs += [_rec(10 + i, [], "wine bottle red", auction="b") for i in range(6)]
    recs += [_rec(20 + i, [], "chinese porcelain vase with stopper", auction=f"c{i % 3}") for i in range(12)]
    aligner = Aligner(recs)
    assert aligner.best(set(range(6)))[0] == "snuff bottle"  # type: ignore[index]
    boiler = [_rec(i, [], "sold without reserve", auction="x") for i in range(4)]
    boiler += [_rec(4, [], "something else", auction="y")]
    assert Aligner(boiler).best({0, 1, 2, 3, 4}) is None  # only one auction says it
