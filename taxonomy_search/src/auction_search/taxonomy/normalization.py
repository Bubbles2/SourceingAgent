"""Term normalisation used for matching and for uniqueness of taxonomy terms.

``normalize_term`` is deliberately simple and deterministic: case-folding, accent removal,
ligature expansion and punctuation-to-space. It is computed in Python (``unaccent`` is not
installed in the database) and stored in ``taxonomy_terms.normalized``.

>>> normalize_term("  Époque LOUIS XIV ")
'epoque louis xiv'
>>> normalize_term("Cœur d'Hermès")
'coeur d hermes'
"""

from __future__ import annotations

import re
import unicodedata

_LIGATURES = str.maketrans({"œ": "oe", "Œ": "oe", "æ": "ae", "Æ": "ae", "ß": "ss"})
_NON_WORD = re.compile(r"[^a-z0-9]+")


def normalize_term(text: str) -> str:
    """Lower-case, strip accents, expand ligatures, and replace punctuation with single spaces."""
    text = text.translate(_LIGATURES)
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_WORD.sub(" ", stripped.casefold()).strip()
