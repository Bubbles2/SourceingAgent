"""Rule-based extractors and text helpers (no database)."""

import pytest

from auction_search.database.source import SourceLot
from auction_search.enrichment.extraction import (
    Gazetteer,
    brand_header,
    extract_lexicon_terms,
    extract_lot,
    extract_makers,
    extract_materials,
    extract_periods_styles,
    maker_header,
    object_heads,
)
from auction_search.enrichment.text import display_name, english_ordinal, int_to_roman, lemma, roman_to_int, strip_title_prefix

GAZ = Gazetteer.from_rows([
    ("fashion.footwear.ankle_boots", "object_type", "fr", "Bottines", "preferred", False),
    ("fashion.footwear.ankle_boots", "object_type", "en", "Ankle boots", "preferred", False),
    ("jewellery_watches.jewellery.rings", "object_type", "fr", "Bagues", "preferred", False),
    ("jewellery_watches.jewellery.earrings", "object_type", "fr", "Boucles d'oreilles", "preferred", False),
    ("technique.boulle_marquetry", "technique", "fr", "Boulle", "synonym", True),
    ("maker.andre_charles_boulle", "maker", "fr", "Boulle", "synonym", True),
])


@pytest.mark.parametrize(("word", "expected"), [("bottines", "bottine"), ("tableaux", "tableau"),
                                                 ("chevaux", "cheval"), ("bijoux", "bijou"), ("bois", "bois"),
                                                 ("tapis", "tapis"), ("glass", "glass"), ("boots", "boot")])
def test_lemma(word: str, expected: str) -> None:
    assert lemma(word) == expected


def test_text_helpers() -> None:
    assert roman_to_int("XVIII") == 18 and roman_to_int("Ier") is None and int_to_roman(19) == "XIX"
    assert english_ordinal(21) == "21st" and english_ordinal(12) == "12th"
    assert display_name("Raymond THIBÉSART") == "Raymond Thibésart"
    assert display_name("LOUIS XIV") == "Louis XIV"
    assert strip_title_prefix("GUCCI Mocassins à mors", "GUCCI") == "Mocassins à mors"


def test_gazetteer_matches_plural_and_longest_term() -> None:
    from auction_search.enrichment.text import tokens

    toks = tokens("Paire de bottine noire et boucles d'oreilles")
    hits = [(sorted(e.concept_key for e in entries)) for entries, _, _ in GAZ.find("fr", toks)]
    assert hits == [["fashion.footwear.ankle_boots"], ["jewellery_watches.jewellery.earrings"]]
    shared = GAZ.find("fr", tokens("Commode Boulle"))
    assert {e.concept_key for e in shared[0][0]} == {"technique.boulle_marquetry", "maker.andre_charles_boulle"}


def test_maker_headers() -> None:
    m = maker_header("Kilian METZINGER (1806 - 1869). Paysage vallonné")
    assert m and m.label == "Kilian Metzinger" and m.years == [1806, 1869] and m.dimension == "maker"
    m = maker_header("BROGER, VERENA (Thalwil, 1943) : Portraits")
    assert m and m.label == "Verena Broger"
    m = maker_header("Carte du Dauphiné. Nicolas Sanson (1600-1667)")
    assert m and m.label == "Nicolas Sanson"
    assert maker_header("Philippe VI (1328-1350). Écu d'or") is None  # a ruler, not a maker
    assert maker_header("Paysage de neige") is None


def test_brand_header() -> None:
    assert brand_header("GUCCI", GAZ).label == "Gucci"  # type: ignore[union-attr]
    assert brand_header("BAGUE ETERNITY, platine", GAZ) is None  # a known object type
    assert brand_header("DEUX TABLES DE CHEVET des années 50.", GAZ) is None
    assert brand_header("VDL. Réunion de 50 photographies", GAZ) is None


def test_periods_and_styles() -> None:
    found = {(m.extractor, m.label, m.label_en) for m in
             extract_periods_styles("Commode d'époque Louis XIV, fin du XIXe siècle, style « famille rose »", "d")}
    assert ("period_epoque", "Époque Louis XIV", "Louis XIV period") in found
    assert ("century", "XIXe siècle", "19th century") in found
    assert ("style", "Style famille rose", "famille rose style") in found
    centuries = [m for m in extract_periods_styles("sabots époque 19ème", "d") if m.extractor == "century"]
    assert [m.key for m in centuries] == ["century:19"]
    assert not [m for m in extract_periods_styles("Époque XXème", "d") if m.extractor == "period_epoque"]
    assert not extract_periods_styles("un vase de style raffiné", "d")
    assert not [m for m in extract_periods_styles("Époque 清康熙 Marque", "d") if m.extractor == "period_epoque"]


def test_makers_and_assertions() -> None:
    ms = extract_makers("Miroir attribué à Bernard MOLITOR (1755-1833)", "d")
    assert [(m.label, m.assertion) for m in ms] == [("Bernard Molitor", "attributed_to")]
    ms = extract_makers("Gravure par Jules Adeline. Parodie", "d")
    assert [m.label for m in ms] == ["Jules Adeline"]
    assert not extract_makers("Hauteur par Poids total", "d")


def test_object_heads() -> None:
    heads = object_heads("Paire de jarres d'apothicaire en majolique", "title_fr")
    assert [(m.extractor, m.key) for m in heads] == [("object_head", "jarre"),
                                                     ("object_compound", "jarre d apothicaire")]
    assert heads[1].parent_key == "jarre"
    assert object_heads("Louis XV, écu d'or", "title_fr") == []
    assert object_heads("Huile sur toile, signée", "title_fr") == []
    assert object_heads("Chine, vase en porcelaine", "title_fr") == []


def test_materials() -> None:
    labels = [m.label for m in extract_materials("Commode en bronze doré et ciselé, placage de bois de rose", "d")]
    assert "Bronze doré" in labels and "Bois de rose" in labels
    assert [m.label for m in extract_materials("Bague en or jaune 750", "d")] == ["Or jaune"]
    assert extract_materials("Vendu en l'état, décor en bleu sous couverte, en tant que tel", "d") == []


def test_lexicons() -> None:
    found = {(m.dimension, m.label, m.label_en) for m in extract_lexicon_terms("vase chinois émaillé", "d")}
    assert found == {("region", "Chine", "China"), ("technique", "Émaillage", "Enamelling")}


def test_extract_lot_end_to_end() -> None:
    lot = SourceLot(
        lot_id=1, source="drouot", source_lot_id="x1", auction_key="a1",
        title={"fr": "GUCCI", "en": "GUCCI"},
        description={"fr": "GUCCI Bottines en cuir noir d'époque Louis XIV",
                     "en": "Der Stiefel ist aus schwarzem Leder und die Sohle ist neu und mit dem Absatz"},
        category={"fr": "Chaussures", "en": "Shoes"},
    )
    rec = extract_lot(lot, GAZ, "fp")
    kinds = {(m.extractor, m.label) for m in rec.mentions}
    assert ("brand_header", "Gucci") in kinds
    assert ("gazetteer", "Bottines") in kinds
    assert ("period_epoque", "Époque Louis XIV") in kinds
    assert ("material_en", "Cuir noir") in kinds
    # "Bottines" is a known term at the start of the description, so it is not a new object candidate
    assert not [m for m in rec.mentions if m.extractor == "object_head"]
    assert rec.skipped_fields == ["description_en"]  # German text in an English column
    assert rec.content_hash == lot.content_hash() and rec.fingerprint == "fp"
