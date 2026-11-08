"""Lightweight, deterministic language identification by function-word frequency.

Used in Phase 1 to check whether ``*_fr`` / ``*_en`` fields really contain French / English.
It needs no model or network access. It is reliable for sentences of a few words or more and
deliberately answers ``"unknown"`` for very short or ambiguous text (e.g. a bare artist name).
"""

from __future__ import annotations

import re
from collections import Counter

# Common function words. Words shared between languages are omitted ("de", "a", "la", "in", ...
# are kept only where they are strongly indicative or appear in a single list).
STOPWORDS: dict[str, frozenset[str]] = {
    "fr": frozenset(
        "le la les des du un une et en est au aux avec pour sur dans par sans sous ou "
        "à dont ce cette ces son sa ses leur qui que ne pas plus deux trois vers époque "
        "siècle petit petite grand grande paire ensemble".split()
    ),
    "en": frozenset(
        "the and of with for on in by from to is was are a an its their this that these "
        "two three pair set small large century circa".split()
    ),
    "de": frozenset(
        "der die das und mit von zu ist im ein eine einer eines dem den des auf aus für "
        "bei oder zwei drei paar jahrhundert".split()
    ),
    "it": frozenset("il lo gli della delle degli dei con per una uno nel nella sul sulla due tre secolo".split()),
    "es": frozenset("el los las del con por para una unos unas y en dos tres siglo".split()),
    "nl": frozenset("het een van met voor op uit en twee drie eeuw".split()),
}

_TOKEN = re.compile(r"[a-zàâäçéèêëîïôöùûüÿœæß]+")

MIN_HITS = 2


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def detect_language(text: str | None, min_hits: int = MIN_HITS) -> str:
    """Return an ISO 639-1 code (``fr``, ``en``, ``de``, ``it``, ``es``, ``nl``) or ``"unknown"``.

    A language wins when it has at least ``min_hits`` stop-word hits and strictly more than any
    other language.
    """
    if not text:
        return "unknown"
    tokens = tokenize(text)
    if not tokens:
        return "unknown"
    scores: Counter[str] = Counter()
    for token in tokens:
        for lang, words in STOPWORDS.items():
            if token in words:
                scores[lang] += 1
    if not scores:
        return "unknown"
    ranked = scores.most_common(2)
    best_lang, best = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    if best < min_hits or best == runner_up:
        return "unknown"
    return best_lang
