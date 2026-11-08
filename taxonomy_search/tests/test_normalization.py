import pytest

from auction_search.taxonomy.normalization import normalize_term


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Époque Louis XIV", "epoque louis xiv"),
        ("  HERMÈS ", "hermes"),
        ("Hermes", "hermes"),
        ("Marqueterie d'écaille et de laiton", "marqueterie d ecaille et de laiton"),
        ("Œuvres sur papier", "oeuvres sur papier"),
        ("Montres-bracelets", "montres bracelets"),
        ("XVIIIème siècle", "xviiieme siecle"),
        ("Archaeology – Antiquity", "archaeology antiquity"),
        ("Straße", "strasse"),
        ("Collectors' items", "collectors items"),
    ],
)
def test_normalize_term(raw: str, expected: str) -> None:
    assert normalize_term(raw) == expected


def test_punctuation_only_normalises_to_empty() -> None:
    assert normalize_term(" – ' ") == ""
