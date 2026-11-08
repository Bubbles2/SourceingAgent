"""Query expansion with the taxonomy (Phase 7) — also used by hybrid search for keyword terms.

Given an understood query, produce a deduplicated, prioritised list of search phrases:

=============== ======================================================= ========= ===============
depth           adds                                                    priority  relationship
=============== ======================================================= ========= ===============
exact           preferred labels in each language, synonyms             1         preferred /
                                                                                  translation /
                                                                                  synonym
                spelling variants                                       2         spelling_variant
broad (default) narrower concepts (ankle boots for boots)               2         narrower
                the broader style/period of a style/period              2         broader_style /
                                                                                  broader_period
                the style born in a period / period of a style           2         related_style /
                                                                                  related_period
                associated techniques                                    3         related_technique
exploratory     every other typed association (revivals, materials,      3–4       related_*
                makers, characteristic objects, 'related')
=============== ======================================================= ========= ===============

Several concept groups are **combined** into phrases ("mobilier Louis XIV", "Louis XIV furniture"),
using the core name of periods/styles. Ambiguous terms ("heels", "or") are never used alone. Results
are cached per (query, language, depth, limit, taxonomy fingerprint).
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from itertools import product
from typing import Any

from auction_search.search.understanding import QueryInterpreter, Understanding, _CORE_STRIP
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.snapshot import TaxonomySnapshot

DEPTHS = ("exact", "broad", "exploratory")
MAX_NARROWER = 40  # sub-types expanded per concept; the plan as a whole is still cut at max_queries
# Ideas that only refine a search ("French" is often implied): not required when combining ideas with AND.
SOFT_GROUP_DIMENSIONS = frozenset({"region"})
# Relationships that say the same thing as the query's own words (used by exact searches).
EXACT_RELATIONSHIPS = frozenset({"preferred", "translation", "synonym", "spelling_variant", "abbreviation"})
_REL_NAMES = {"originated_in_period": ("related_period", "related_style"), "revival_of": ("revival_of", "revived_by"),
              "associated_technique": ("related_technique", "technique_of"),
              "associated_material": ("related_material", "material_of"), "named_after": ("named_after", "eponym_of"),
              "active_in_period": ("active_in_period", "period_of_maker"),
              "associated_region": ("related_region", "region_of"),
              "characteristic_object": ("related_object", "typical_of"), "related": ("related", "related")}


@dataclass
class ExpansionQuery:
    term: str
    language: str
    relationship: str
    priority: int
    concept: str | None = None
    combined: bool = False
    group: int | None = None         # index in ExpansionPlan.groups; None for combined phrases and leftover words


@dataclass
class ExpansionPlan:
    query: str
    language: str
    depth: str
    taxonomy_scope: str
    concepts: list[str]
    unresolved_terms: list[str]
    queries: list[ExpansionQuery] = field(default_factory=list)
    groups: list[dict[str, Any]] = field(default_factory=list)
    cached: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def core_name(term: str) -> str:
    """'Style Louis XIV' → 'Louis XIV'; 'Reign of Louis XIV' → 'Louis XIV' (keeps the original casing)."""
    words = term.split()
    while words and normalize_term(words[0]) in _CORE_STRIP:
        words.pop(0)
    while words and normalize_term(words[-1]) in _CORE_STRIP:
        words.pop()
    return " ".join(words) or term


class QueryExpander:
    def __init__(self, snap: TaxonomySnapshot, cache_size: int = 256) -> None:
        self.snap = snap
        self.interpreter = QueryInterpreter(snap)
        self._cache: OrderedDict[tuple[str, str, str, int], ExpansionPlan] = OrderedDict()
        self.cache_size = cache_size

    # ---- labels ---------------------------------------------------------------------

    def _labels(self, key: str, languages: tuple[str, ...], query_lang: str, base_priority: int,
                relationship: str | None = None) -> list[ExpansionQuery]:
        out = []
        for t in self.snap.terms_of(key):
            if t.language not in languages and t.language != "und":
                continue
            if t.ambiguous:
                continue
            if relationship:
                rel, prio = relationship, base_priority + (0 if t.term_type == "preferred" else 1)
            elif t.term_type == "preferred":
                rel = "translation" if query_lang in ("fr", "en") and t.language != query_lang else "preferred"
                prio = base_priority
            elif t.term_type == "synonym":
                rel, prio = "synonym", base_priority
            elif t.term_type in ("spelling_variant", "abbreviation"):
                rel, prio = t.term_type, base_priority + 1
            else:
                continue
            out.append(ExpansionQuery(t.term, t.language, rel, prio, key))
        return out

    def _group_terms(self, keys: list[str], languages: tuple[str, ...], query_lang: str, depth: str
                     ) -> list[ExpansionQuery]:
        terms: list[ExpansionQuery] = []
        for key in keys:
            terms += self._labels(key, languages, query_lang, 1)
            if depth == "exact":
                continue
            dim = self.snap.concepts[key].dimension
            # Nearest sub-types first (furniture → seating, tables … before armchairs, consoles …), so a
            # cut keeps whole branches instead of whatever sorts first alphabetically.
            children = sorted(self.snap.descendants(key), key=lambda c: (len(self.snap.ancestors(c)), c))
            for child in children[:MAX_NARROWER]:
                terms += self._labels(child, languages, query_lang, 2, "narrower")
            if dim in ("period", "style"):
                for parent in sorted(self.snap.ancestors(key)):
                    terms += self._labels(parent, languages, query_lang, 2, f"broader_{dim}")
            for rel, other, direction in self.snap.associations(key):
                if other not in self.snap.concepts:
                    continue
                name = _REL_NAMES.get(rel, (rel, rel))[0 if direction == "out" else 1]
                if rel == "originated_in_period":
                    prio = 2
                elif rel == "associated_technique" and direction == "out":
                    prio = 3
                elif depth == "exploratory":
                    prio = 3 if self.snap.weight(rel) >= 0.5 else 4
                else:
                    continue
                terms += self._labels(other, languages, query_lang, prio, name)
        return terms

    # ---- public ---------------------------------------------------------------------

    def understand(self, query: str) -> Understanding:
        return self.interpreter.understand(query)

    def expand(self, query: str, language: str = "all", depth: str = "broad", max_queries: int = 20,
               understanding: Understanding | None = None) -> ExpansionPlan:
        if depth not in DEPTHS:
            raise ValueError(f"depth must be one of {DEPTHS}")
        cache_key = (normalize_term(query), language, depth, max_queries)
        if cache_key in self._cache:
            self._cache.move_to_end(cache_key)
            plan = self._cache[cache_key]
            return ExpansionPlan(**{**plan.__dict__, "cached": True})
        u = understanding or self.interpreter.understand(query)
        languages = ("fr", "en") if language in ("all", "auto") else (language,)
        qlang = u.language if u.language in ("fr", "en") else "en"
        plan = ExpansionPlan(query, language, depth, self.snap.scope, u.concepts, u.unresolved)

        per_group = []
        for index, g in enumerate(u.groups):
            terms = self._group_terms(g.keys, languages, qlang, depth)
            for t in terms:
                t.group = index
            per_group.append(terms)
            plan.groups.append({"text": g.text, "concepts": g.keys, "dimension": g.dimension,
                                "ambiguous": g.ambiguous, "required": g.dimension not in SOFT_GROUP_DIMENSIONS})
        if plan.groups and not any(g["required"] for g in plan.groups):  # only soft ideas: they are what was asked
            for g in plan.groups:
                g["required"] = True

        queries: list[ExpansionQuery] = []
        if len(u.groups) > 1:
            queries += self._combined(u, per_group, languages)
        for terms in per_group:
            queries += terms
        if u.unresolved:
            queries.append(ExpansionQuery(" ".join(u.unresolved), "und", "original_words", 1))
        if not u.groups:
            queries.insert(0, ExpansionQuery(query, u.language, "original", 1))

        seen: dict[str, ExpansionQuery] = {}
        unique = []
        for q in sorted(queries, key=lambda q: (q.priority, not q.combined)):
            n = normalize_term(q.term)
            if not n:
                continue
            kept = seen.get(n)
            if kept is None:
                seen[n] = q
                unique.append(q)
            elif kept.group == q.group and "und" not in (kept.language, q.language) and kept.language != q.language:
                kept.language = "und"  # the same word in both languages ("Commodes", "Tables"): valid in both
        plan.queries = unique[:max_queries]
        self._cache[cache_key] = plan
        if len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)
        return plan

    def _combined(self, u: Understanding, per_group: list[list[ExpansionQuery]], languages: tuple[str, ...]
                  ) -> list[ExpansionQuery]:
        """Phrases joining one label of every group: 'mobilier Louis XIV', 'Louis Quatorze furniture'."""
        out = []
        dims = [g.dimension for g in u.groups]
        for lang in languages:
            options = []
            for g, terms in zip(u.groups, per_group):
                labels = [t for t in terms if t.language in (lang, "und") and t.priority == 1]
                if not labels:
                    labels = [ExpansionQuery(g.text, lang, "original", 1)]
                options.append(labels[:3])
            for combo in list(product(*options))[:6]:
                parts = []
                for t, dim in zip(combo, dims):
                    word = core_name(t.term) if dim in ("period", "style", "period/style", "mixed") else t.term
                    parts.append(word.lower() if dim in ("category", "subcategory", "object_type") else word)
                # French puts the object first ("mobilier Louis XIV"); English puts qualifiers first.
                objects = [p for p, d in zip(parts, dims) if d in ("category", "subcategory", "object_type")]
                others = [p for p, d in zip(parts, dims) if d not in ("category", "subcategory", "object_type")]
                phrase = " ".join(objects + others) if lang == "fr" else " ".join(others + objects)
                rel = "synonym" if any(t.relationship == "synonym" for t in combo) else (
                    "translation" if u.language in ("fr", "en") and lang != u.language else "preferred")
                out.append(ExpansionQuery(phrase[:1].upper() + phrase[1:], lang, rel, 1, None, combined=True))
        return out
