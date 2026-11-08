"""Search criteria for any search engine or API, built from the taxonomy alone (no lots involved).

A query is split into *ideas* (the expansion plan's groups). Each idea gets every word a catalogue
may use for it, in French and English; a lot is relevant when it contains one word of **every
required idea**. For "Louis XIV furniture":

    idea 1 (required)  Louis XIV   "Louis XIV", "Louis Quatorze"
    idea 2 (required)  furniture   "Mobilier", "Meubles", "Commodes", "Fauteuils", "Consoles", …

    boolean (fr)  ("Louis XIV" OR "Louis Quatorze") AND ("Mobilier" OR "Meubles" OR "Commodes" OR …)
    phrases (fr)  "Mobilier Louis XIV", "Commodes Louis XIV", "Fauteuils Louis XIV", …
                  (for search boxes without AND/OR)

Which words an idea gets depends on the depth, as in the internal search: ``exact`` — words with the
same meaning (labels, translations, synonyms, variants); ``broad`` — + sub-types (commode for
furniture); ``exploratory`` — + related ideas (French Baroque, Boulle marquetry for Louis XIV).

A period/style idea with no "époque"/"style" in the query also gets its *core name* ("Louis XIV"),
and words that contain another word of the same idea are dropped ("Style Louis XIV" contains
"Louis XIV"): anything matching the longer phrase also matches the shorter one, so requests get
shorter without losing results.

The canonical request syntax is ``("a" OR "b") AND ("c" OR "d")`` (``render_boolean`` /
``parse_boolean``); provider adapters translate it to their own API.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from itertools import product
from typing import Any

from auction_search.search.expansion import EXACT_RELATIONSHIPS, ExpansionPlan, QueryExpander, core_name
from auction_search.search.understanding import Understanding
from auction_search.taxonomy.normalization import normalize_term

LANGUAGES = ("fr", "en")
FULL_PLAN = 1000            # expansion size used for criteria: the whole plan, never cut by priority
MAX_TERMS_PER_GROUP = 40    # keywords per idea and language
MAX_PHRASES = 40            # combined phrases per language
QUALIFIER_DIMENSIONS = frozenset({"period", "style", "period/style", "mixed"})
OBJECT_DIMENSIONS = frozenset({"category", "subcategory", "object_type"})
_NO_INTENT = frozenset({"period/style", "mixed"})


def relationships_for(depth: str) -> frozenset[str] | None:
    """Relationships an idea keeps at each depth (None = all)."""
    if depth == "exact":
        return EXACT_RELATIONSHIPS | {"core_name"}
    if depth == "broad":
        return EXACT_RELATIONSHIPS | {"core_name", "narrower"}
    return None


# ---- canonical boolean syntax ------------------------------------------------------------

def _quote(term: str) -> str:
    return '"' + term.replace('"', "").strip() + '"'


def render_boolean(cnf: list[list[str]]) -> str:
    """[['Louis XIV', 'Louis Quatorze'], ['Commodes']] → '("Louis XIV" OR "Louis Quatorze") AND "Commodes"'."""
    parts = []
    for alternatives in cnf:
        inner = " OR ".join(_quote(a) for a in alternatives)
        parts.append(f"({inner})" if len(cnf) > 1 and len(alternatives) > 1 else inner)
    return " AND ".join(parts)


def parse_boolean(query: str) -> list[list[str]]:
    """Inverse of ``render_boolean``; also accepts a plain phrase or an OR list."""
    cnf = []
    for part in re.split(r"\s+AND\s+", query.strip()):
        part = part.strip()
        if part.startswith("(") and part.endswith(")"):
            part = part[1:-1]
        alternatives = [a.strip().strip('"').strip() for a in re.split(r"\s+OR\s+", part)]
        alternatives = [a for a in alternatives if a]
        if alternatives:
            cnf.append(alternatives)
    return cnf


def split_cnf(cnf: list[list[str]], max_length: int) -> list[list[list[str]]]:
    """Split the longest OR-list in halves until every request fits ``max_length``.

    Every part keeps all the ideas (so each request still means "A AND B"), and every keyword is
    used exactly once, in its original order. A request that cannot be shortened is dropped.
    """
    if not cnf or len(render_boolean(cnf)) <= max_length:
        return [cnf] if cnf else []
    i = max(range(len(cnf)), key=lambda k: (len(cnf[k]), len(" OR ".join(cnf[k]))))
    if len(cnf[i]) == 1:
        return []
    half = (len(cnf[i]) + 1) // 2
    first = cnf[:i] + [cnf[i][:half]] + cnf[i + 1:]
    second = cnf[:i] + [cnf[i][half:]] + cnf[i + 1:]
    return split_cnf(first, max_length) + split_cnf(second, max_length)


# ---- criteria ---------------------------------------------------------------------------

@dataclass
class CriteriaTerm:
    term: str
    language: str              # fr | en | und (both)
    relationship: str          # preferred, synonym, narrower, core_name, combined, …
    priority: int
    concept: str | None = None


@dataclass
class CriteriaGroup:
    text: str                  # words of the query that produced the idea
    concepts: list[str]
    dimension: str
    required: bool
    terms: dict[str, list[CriteriaTerm]] = field(default_factory=dict)   # by language
    covered: dict[str, dict[str, str]] = field(default_factory=dict)      # by language: dropped term → shorter one

    def words(self, language: str) -> list[str]:
        return [t.term for t in self.terms.get(language, [])]


@dataclass
class SearchCriteria:
    query: str
    depth: str
    taxonomy_scope: str
    languages: tuple[str, ...]
    groups: list[CriteriaGroup] = field(default_factory=list)
    phrases: dict[str, list[CriteriaTerm]] = field(default_factory=dict)  # for APIs without AND/OR
    soft_words: list[str] = field(default_factory=list)                   # leftover words: ranking only

    def required(self) -> list[CriteriaGroup]:
        return [g for g in self.groups if g.required]

    def cnf(self, language: str) -> list[list[str]]:
        """AND of OR-lists: one list per required idea that has words in this language."""
        return [g.words(language) for g in self.required() if g.words(language)]

    def boolean(self, language: str) -> str:
        return render_boolean(self.cnf(language))

    def term_info(self, language: str) -> dict[str, CriteriaTerm]:
        """Keyword → its details, for attribution and logging."""
        info = {t.term: t for t in self.phrases.get(language, [])}
        for g in self.groups:
            info |= {t.term: t for t in g.terms.get(language, [])}
        return info

    def as_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["boolean"] = {lang: self.boolean(lang) for lang in self.languages}
        return out


def _contains(longer: str, shorter: str) -> bool:
    """True when the words of ``shorter`` appear, in order and next to each other, in ``longer``."""
    a, b = normalize_term(longer).split(), normalize_term(shorter).split()
    return len(b) < len(a) and any(a[i:i + len(b)] == b for i in range(len(a) - len(b) + 1))


def _drop_covered(terms: list[CriteriaTerm], covered: dict[str, str]) -> list[CriteriaTerm]:
    kept = []
    for t in terms:
        shorter = next((o.term for o in terms if o is not t and _contains(t.term, o.term)), None)
        if shorter is None:
            kept.append(t)
        else:
            covered[t.term] = shorter
    return kept


def _dedupe(terms: list[CriteriaTerm]) -> list[CriteriaTerm]:
    seen, out = set(), []
    for t in terms:
        n = normalize_term(t.term)
        if n and n not in seen:
            seen.add(n)
            out.append(t)
    return out


def build_criteria(plan: ExpansionPlan, max_terms_per_group: int = MAX_TERMS_PER_GROUP,
                   max_phrases: int = MAX_PHRASES) -> SearchCriteria:
    """Criteria from an expansion plan. Build the plan with ``max_queries=FULL_PLAN`` so nothing is cut."""
    languages = LANGUAGES if plan.language in ("all", "auto") else (plan.language,)
    keep = relationships_for(plan.depth)
    criteria = SearchCriteria(plan.query, plan.depth, plan.taxonomy_scope, languages)

    for index, g in enumerate(plan.groups):
        group = CriteriaGroup(g["text"], list(g["concepts"]), g["dimension"], bool(g.get("required", True)))
        own = [q for q in plan.queries if q.group == index and (keep is None or q.relationship in keep)]
        cores: list[CriteriaTerm] = []
        if g["dimension"] in _NO_INTENT:  # both the period and the style: "Louis XIV" covers "Époque/Style Louis XIV"
            cores = [CriteriaTerm(core_name(q.term), "und", "core_name", 1, None)
                     for q in own if q.relationship in EXACT_RELATIONSHIPS]
        for lang in languages:
            terms = cores + [CriteriaTerm(q.term, q.language, q.relationship, q.priority, q.concept)
                             for q in own if q.language in (lang, "und")]
            group.covered[lang] = {}
            group.terms[lang] = _drop_covered(_dedupe(terms), group.covered[lang])[:max_terms_per_group]
        criteria.groups.append(group)

    words = [w for w in plan.unresolved_terms if w]
    if not plan.groups:  # nothing recognised: the query's own words are the criteria
        text = " ".join(words) or plan.query
        criteria.groups.append(CriteriaGroup(text, [], "word", True,
                                             {lang: [CriteriaTerm(text, "und", "original", 1)] for lang in languages}))
    elif plan.depth == "exact":  # exact searches require every word, as the internal search does
        for w in words:
            criteria.groups.append(CriteriaGroup(w, [], "word", True,
                                                 {lang: [CriteriaTerm(w, "und", "original", 1)] for lang in languages}))
    else:
        criteria.soft_words = words

    for lang in languages:
        criteria.phrases[lang] = _phrases(criteria, lang)[:max_phrases]
    return criteria


def _phrases(criteria: SearchCriteria, language: str) -> list[CriteriaTerm]:
    """One phrase per combination of required ideas, the object first in French ("Commodes Louis XIV")
    and last in English ("Louis XIV commodes"); a single idea gives its own words."""
    groups = [g for g in criteria.required() if g.terms.get(language)]
    if not groups:
        return []
    if len(groups) == 1:
        return list(groups[0].terms[language])
    obj_index = next((i for i, g in enumerate(groups) if g.dimension in OBJECT_DIMENSIONS), 0)
    obj = groups[obj_index]
    qualifiers = [g for i, g in enumerate(groups) if i != obj_index]
    # Qualifiers: their two main words each (core names come first), so the phrase count stays small.
    options = [g.terms[language][:2] for g in qualifiers]
    out = []
    # Main qualifier words first for every object ("Commodes Louis XIV" before "Commodes Louis Quatorze"),
    # so a cut keeps every kind of object.
    for combo in product(*options):
        for o in obj.terms[language]:
            quals = " ".join(t.term for t in combo)
            word = o.term if language == "fr" else o.term[:1].lower() + o.term[1:]
            phrase = f"{word} {quals}" if language == "fr" else f"{quals} {word}"
            out.append(CriteriaTerm(phrase[:1].upper() + phrase[1:], language, "combined",
                                    max([o.priority, *(t.priority for t in combo)]), o.concept))
    return _dedupe(out)


def criteria_for(expander: QueryExpander, query: str, language: str = "all", depth: str = "broad",
                 max_terms_per_group: int = MAX_TERMS_PER_GROUP, understanding: Understanding | None = None
                 ) -> SearchCriteria:
    """Expand the query (whole plan) and build its criteria."""
    plan = expander.expand(query, language=language, depth=depth, max_queries=FULL_PLAN, understanding=understanding)
    return build_criteria(plan, max_terms_per_group=max_terms_per_group)
