import pytest

from auction_search.text.language import detect_language


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Commode en marqueterie Boulle, époque Louis XIV, dessus de marbre", "fr"),
        ("Paire de bottines en cuir noir avec un talon et une boucle", "fr"),
        ("A pair of black leather ankle boots with a heel and a buckle", "en"),
        ("Gilded bronze mirror decorated with palmettes; the stand on a tripod base", "en"),
        ("Paar Tassen mit Untertassen mit Blumenbuketts, Meissen, um 1730", "de"),
    ],
)
def test_detects_common_languages(text: str, expected: str) -> None:
    assert detect_language(text) == expected


@pytest.mark.parametrize("text", [None, "", "   ", "HERMÈS", "Raymond THIBÉSART (1874-1968)", "123 456"])
def test_short_or_name_only_text_is_unknown(text: str | None) -> None:
    assert detect_language(text) == "unknown"


def test_tie_is_unknown() -> None:
    # One French and one English function word each, twice: no clear winner.
    assert detect_language("le the le the") == "unknown"
