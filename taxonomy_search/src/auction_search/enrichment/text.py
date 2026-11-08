"""Text preparation shared by the extractors: cleaning, tokens with character spans, lemmas.

>>> lemma("bottines a talons")
'bottine a talon'
>>> roman_to_int("XVIII")
18
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

from auction_search.taxonomy.normalization import normalize_term

_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

# French/English plural endings that must not be stripped ("bois", "bras", "tapis", "glass").
_KEEP_FINAL_S = ("ss", "us", "is", "os", "as", "ys")


def clean(text: str | None) -> str:
    """Decode HTML entities and collapse whitespace."""
    if not text:
        return ""
    return _WS.sub(" ", html.unescape(text).replace(" ", " ")).strip()


def strip_title_prefix(description: str, title: str) -> str:
    """Most descriptions start with the full title (Phase 1: ~90%); return the rest."""
    if title and description.startswith(title):
        return description[len(title):].lstrip(" .,:;-–—\n")
    return description


@dataclass(frozen=True)
class Token:
    norm: str
    start: int
    end: int


def tokens(text: str) -> list[Token]:
    """Normalised word tokens with their character spans in ``text``."""
    out: list[Token] = []
    for m in _TOKEN.finditer(text):
        for part in normalize_term(m.group()).split():
            out.append(Token(part, m.start(), m.end()))
    return out


def lemma_token(token: str) -> str:
    """Crude singular form, applied identically to text and taxonomy terms so they meet."""
    if len(token) <= 3 or token.isdigit():
        return token
    if token.endswith("eaux"):
        return token[:-1]
    if token.endswith("oux"):
        return token[:-1]
    if token.endswith("aux") and len(token) > 4:
        return token[:-3] + "al"
    if token.endswith("s") and not token.endswith(_KEEP_FINAL_S):
        return token[:-1]
    return token


def lemma(normalized: str) -> str:
    return " ".join(lemma_token(t) for t in normalized.split())


def roman_to_int(value: str) -> int | None:
    value = value.upper()
    if not value or any(ch not in _ROMAN for ch in value):
        return None
    total = 0
    for i, ch in enumerate(value):
        v = _ROMAN[ch]
        total += -v if i + 1 < len(value) and _ROMAN[value[i + 1]] > v else v
    return total


def int_to_roman(n: int) -> str:
    out = ""
    for value, sym in ((100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"),
                       (1, "I")):
        while n >= value:
            out += sym
            n -= value
    return out


def english_ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


_PARTICLES = {"de", "du", "des", "van", "von", "der", "den", "di", "da", "del", "della", "le", "la", "y", "d"}


def display_name(surface: str) -> str:
    """'Raymond THIBÉSART' → 'Raymond Thibésart'; keeps particles lower-case."""
    words = []
    for word in surface.split():
        if word.lower() in _PARTICLES and words:
            words.append(word.lower())
        elif roman_to_int(word) is not None:
            words.append(word.upper())  # Louis XIV, Napoléon III
        elif word.isupper() and len(word) > 1:
            words.append("-".join(part.capitalize() for part in word.split("-")))
        else:
            words.append(word)
    return " ".join(words)


def capitalize_first(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def is_mostly_upper(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and sum(c.isupper() for c in letters) / len(letters) > 0.8
