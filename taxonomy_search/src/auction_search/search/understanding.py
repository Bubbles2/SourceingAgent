"""Query understanding: turn a natural-language query into concept groups and leftover words.

* Taxonomy terms are found in the query in French and English (singular/plural tolerant).
* Period and style concepts are also found by their *core name* ("Louis XIV" in "Style Louis XIV" /
  "Époque Louis XIV"), so "Louis XIV furniture" resolves.
* Intent words decide between period and style: "period", "époque", "d'époque", "made in", "genuine" →
  the period only; "style", "goût", "in the manner/taste of" → the style only; otherwise both, and the
  results say which one each lot matched.
* Search noise ("find", "auctions selling", "trouver", "ventes") is ignored; the remaining content
  words are *unresolved terms* — searched as keywords and logged to improve the taxonomy (Phase 10).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from auction_search.enrichment.text import lemma, lemma_token, tokens
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.snapshot import TaxonomySnapshot
from auction_search.text.language import detect_language

NOISE = frozenset(
    "find search show me give list get looking look want need any some all lots lot auction auctions selling sell "
    "sold sale sales item items piece pieces object objects for with of the a an and or in on at by to from that "
    "which trouver chercher rechercher cherche montre moi vente ventes enchere encheres objet objets piece pieces "
    "de des du la le les l d un une et ou en a au aux pour avec sur dans par".split())
PERIOD_INTENT = frozenset("period periode epoque made genuine authentic dated original".split())
STYLE_INTENT = frozenset("style gout manner taste fashion facon maniere".split())
_CORE_STRIP = frozenset("style epoque period periode gout reign regne of de du d the".split())


@dataclass
class ConceptGroup:
    text: str                        # words of the query that produced the group
    keys: list[str]                  # alternatives: the group is satisfied by any of them (or a descendant)
    dimension: str
    ambiguous: bool = False
    via: str = "term"                # term | core_name


@dataclass
class Understanding:
    query: str
    normalized: str
    language: str
    groups: list[ConceptGroup] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)
    intent: str | None = None        # 'period' | 'style' | None

    @property
    def concepts(self) -> list[str]:
        return sorted({k for g in self.groups for k in g.keys})


class QueryInterpreter:
    def __init__(self, snap: TaxonomySnapshot) -> None:
        self.snap = snap
        self.core: dict[tuple[str, ...], set[str]] = defaultdict(set)
        for t in snap.terms:
            c = snap.concepts.get(t.concept_key)
            if c and c.dimension in ("period", "style"):
                core = tuple(w for w in lemma(normalize_term(t.term)).split() if w not in _CORE_STRIP)
                if core:
                    self.core[core].add(t.concept_key)
        self.max_core = max((len(k) for k in self.core), default=1)

    def understand(self, query: str) -> Understanding:
        toks = tokens(query)
        lem = [lemma_token(t.norm) for t in toks]
        u = Understanding(query, normalize_term(query), detect_language(query))
        words = set(lem)
        u.intent = ("period" if words & PERIOD_INTENT and not words & STYLE_INTENT
                    else "style" if words & STYLE_INTENT and not words & PERIOD_INTENT else None)
        covered = [False] * len(toks)

        # 1) taxonomy terms (longest match first, both languages)
        spans: list[tuple[int, int, list, str]] = []
        for lang in ("en", "fr"):
            for entries, a, b in self.snap.gazetteer.find(lang, toks):
                spans.append((a, b, entries, lang))
        matched_langs: dict[str, int] = {"fr": 0, "en": 0}
        for a, b, entries, lang in sorted(spans, key=lambda x: (-(x[1] - x[0]), x[0], x[3] != "fr")):
            if any(covered[a:b]):
                continue
            if all(e.language == lang for e in entries):
                matched_langs[lang] += b - a
            keys = sorted({e.concept_key for e in entries})
            dims = {self.snap.concepts[k].dimension for k in keys if k in self.snap.concepts}
            dim = dims.pop() if len(dims) == 1 else "mixed"
            u.groups.append(ConceptGroup(query[toks[a].start:toks[b - 1].end], keys, dim,
                                         any(e.ambiguous for e in entries) or len(keys) > 1))
            covered[a:b] = [True] * (b - a)

        # 2) core names of periods/styles on what is left ("Louis XIV")
        i = 0
        while i < len(toks):
            hit = None
            for n in range(min(self.max_core, len(toks) - i), 0, -1):
                if not any(covered[i:i + n]) and tuple(lem[i:i + n]) in self.core:
                    hit = (n, self.core[tuple(lem[i:i + n])])
                    break
            if hit is None:
                i += 1
                continue
            n, keys = hit
            covered[i:i + n] = [True] * n
            u.groups.append(ConceptGroup(query[toks[i].start:toks[i + n - 1].end], sorted(keys), "period/style",
                                         via="core_name"))
            i += n

        # 3) intent: keep the period or the style alternative when the query says which
        for g in u.groups:
            if u.intent and g.dimension in ("period/style", "mixed", "period", "style"):
                wanted = [k for k in g.keys if self.snap.concepts[k].dimension == u.intent]
                if not wanted and u.intent == "style":
                    # "Louis XIV style" when only the period was matched: use the style born in that period
                    wanted = [a for rel, a, b in self.snap.relationships
                              if rel == "originated_in_period" and b in g.keys]
                if wanted:
                    g.keys = sorted(set(wanted))
                    g.dimension = u.intent

        intent_words = PERIOD_INTENT | STYLE_INTENT
        u.unresolved = [t.norm for t, c, lm in zip(toks, covered, lem)
                        if not c and lm not in NOISE and t.norm not in NOISE and lm not in intent_words
                        and len(t.norm) > 2 and not t.norm.isdigit()]
        u.groups.sort(key=lambda g: query.lower().find(g.text.lower()))
        if u.language not in ("fr", "en"):  # short queries: use the language of the matched terms
            if matched_langs["fr"] != matched_langs["en"]:
                u.language = max(matched_langs, key=lambda k: matched_langs[k])
        return u
