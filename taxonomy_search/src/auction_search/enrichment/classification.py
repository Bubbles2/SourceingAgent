"""Rule-based lot classification into ``auction_search.lot_concepts`` (Phase 4). No AI.

For each lot:

1. **Source category** — the Drouot category's mappings (``source_category_mappings``) give
   ``classified_as`` (and sometimes ``made_of`` / ``uses_technique`` / ``originates_from``).
2. **Taxonomy terms in the text** (title, description; French and English; fields in another
   language are skipped). Where the term occurs sets the strength:

   ======== ====================================== ==========================================
   position meaning                                 effect
   ======== ====================================== ==========================================
   title    what the lot is                         full assertion, confidence 0.9
   lead     first 300 characters of description    full assertion, confidence 0.8
   note     the rest (catalogue essays, provenance) only ``mentions``, confidence 0.4
   ======== ====================================== ==========================================

3. **Context** in the 40 characters before a match changes the assertion:
   "style / goût / dans le goût de / in the style of" turns a *period* into ``in_style_of`` the style
   that originated in it (or ``mentions`` if there is none); "attribué à", "atelier de",
   "entourage de", "suiveur de", "d'après" (and English equivalents) qualify a *maker*.
4. **Ambiguous terms** ("or", "heels", "pumps", bare "Boulle") never create an assertion on their own;
   if the same concept is not also matched unambiguously, the lot is flagged for review.

A lot is flagged ``needs_review`` when: it has no object classification; dating conflicts (two
non-overlapping periods); its Drouot category and its text point to different top-level categories;
or a concept was matched only through an ambiguous term. A mention is evidence, not an assertion.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from auction_search.database.source import SourceLot
from auction_search.enrichment.extraction import _quote
from auction_search.enrichment.lexicons import FR_QUANTIFIERS
from auction_search.enrichment.text import clean, strip_title_prefix, tokens
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.snapshot import TaxonomySnapshot
from auction_search.text.language import detect_language

CLASSIFIER_VERSION = "4.3"
# Departments organised by culture: a lot can be in "Asian art" and be a vase (decorative arts).
CULTURE_CATEGORIES = frozenset({"world_arts"})
LEAD_CHARS = 300
CONTEXT_CHARS = 40
POSITION_CONFIDENCE = {"title": 0.9, "lead": 0.8, "note": 0.4}

DEFAULT_ASSERTION = {
    "category": "classified_as", "subcategory": "classified_as", "object_type": "classified_as",
    "period": "dated_to", "style": "in_style_of", "material": "made_of", "technique": "uses_technique",
    "region": "originates_from", "maker": "made_by",
}

# Words right before an object noun that make it a complement or packaging, not the lot itself:
# "cadre à bijoux", "boîte pour cigares", "dans leur boîte d'origine", "with box", "for wine".
_COMPLEMENT_CUE = re.compile(r"(?:\ba|\bau|\baux|\bpour|\bdans (?:une|un)|\bavec|\bsans|\bsa|\bson|\bses|\bleur"
                             r"|\bleurs|\bwith(?: its| their| the)?|\bin (?:its|their|the)(?: original)?|\bits|\btheir"
                             r"|\bfor|\bde rangement)\s+$")
# Material words that do not mean the material itself: "plaqué or", "gold-tone", "gold-plated".
_NOT_MATERIAL_BEFORE = re.compile(r"(?:\bplaque|\bimitation|\bfacon|\beffet|\bgenre)\s+$")
_NOT_MATERIAL_AFTER = re.compile(r"^\s*(?:tone|plated|plate|coloured|colored|color|colour|effect|finish|toned|filled)\b")

_CLAUSE_BREAK = re.compile(r"[,.;:()\[\]/]")

# Collective words after which "de"/"of" introduces the objects themselves ("lot de bagues", "pair of boots").
_COLLECTIVES = FR_QUANTIFIERS | frozenset(
    "collection collections serie series reunion pair pairs set sets group groups lot lots assortment "
    "selection important rare fine large small a an two three four five six seven eight nine ten".split())


def _noun_complement(before: str) -> bool:
    """'livres d'horlogerie', 'works of …': the matched noun complements another noun."""
    words = before.split()
    return len(words) >= 2 and words[-1] in ("de", "d", "du", "des", "of") and words[-2] not in _COLLECTIVES


_STYLE_CUE = re.compile(r"(?:\bstyle|\bgout|\bgenre|\bmaniere|\bfacon|\binspire|\ba la mode|\bin the style|"
                        r"\bin the manner|\bin the taste)\W*(?:\w+\W+){0,3}$")
_MAKER_CUES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(p + r"\W*(?:\w+\W+){0,2}$"), a) for p, a in (
        (r"\battribue(?:e|s)? a|\battributed to", "attributed_to"),
        (r"\batelier de|\bworkshop of|\bstudio of", "workshop_of"),
        (r"\bentourage de|\bcercle de|\bcircle of", "circle_of"),
        (r"\bsuiveur de|\becole de|\bfollower of|\bschool of", "follower_of"),
        (r"\bd apres|\bafter", "after"),
        (r"\bdans le gout de|\bgout de|\bmanner of|\bstyle of", "mentions"),
    ))


@dataclass
class LotAssertion:
    concept_key: str
    dimension: str
    assertion: str
    confidence: float
    method: str            # rule | source_category
    source_field: str
    position: str          # title | lead | note | category
    quote: str


@dataclass
class LotClassification:
    lot: SourceLot
    assertions: list[LotAssertion]
    needs_review: bool
    reasons: list[str] = field(default_factory=list)


class Classifier:
    def __init__(self, snapshot: TaxonomySnapshot) -> None:
        self.snap = snapshot
        # period -> style that originated in it (for "dans le goût Louis XIV" → in_style_of style.louis_xiv)
        self.style_of_period = {b: a for rel, a, b in snapshot.relationships if rel == "originated_in_period"}

    # ---- helpers ----------------------------------------------------------------

    def _concept_factor(self, key: str) -> float:
        c = self.snap.concepts.get(key)
        return 1.0 if c is None else min(1.0, max(0.5, c.confidence))

    def _context_assertion(self, key: str, dimension: str, before: str, position: str,
                           after: str = "") -> tuple[str, str]:
        """(assertion, concept key) after looking at the words around the match."""
        if position == "note":
            return "mentions", key
        if dimension in ("category", "subcategory", "object_type") and (
                _COMPLEMENT_CUE.search(before) or _noun_complement(before)):
            return "mentions", key
        if dimension == "material" and (_NOT_MATERIAL_BEFORE.search(before) or _NOT_MATERIAL_AFTER.search(after)):
            return "mentions", key
        if dimension == "period" and _STYLE_CUE.search(before):
            style = self.style_of_period.get(key)
            return ("in_style_of", style) if style else ("mentions", key)
        if dimension == "maker":
            for rx, assertion in _MAKER_CUES:
                if rx.search(before):
                    return assertion, key
        return DEFAULT_ASSERTION.get(dimension, "mentions"), key

    def _fields(self, lot: SourceLot) -> tuple[dict[str, tuple[str, str]], list[str]]:
        fields: dict[str, tuple[str, str]] = {}
        skipped = []
        for lang in ("fr", "en"):
            title = clean(lot.title.get(lang))
            desc = strip_title_prefix(clean(lot.description.get(lang)), title)
            for name, value in ((f"title_{lang}", title), (f"description_{lang}", desc)):
                if not value:
                    continue
                if detect_language(value) in (lang, "unknown"):
                    fields[name] = (lang, value)
                else:
                    skipped.append(name)
        return fields, skipped

    # ---- classification ---------------------------------------------------------

    def classify(self, lot: SourceLot) -> LotClassification:
        found: dict[tuple[str, str], LotAssertion] = {}
        ambiguous_only: set[str] = set()
        unambiguous: set[str] = set()

        def keep(a: LotAssertion) -> None:
            k = (a.concept_key, a.assertion)
            if k not in found or a.confidence > found[k].confidence:
                found[k] = a

        for key, assertion, conf in self.snap.category_map.get(lot.category.get("fr") or "", []):
            dim = self.snap.concepts[key].dimension
            keep(LotAssertion(key, dim, assertion, round(0.95 * conf, 3), "source_category", "category_fr",
                              "category", lot.category.get("fr") or ""))

        fields, _ = self._fields(lot)
        pending_ambiguous: list[tuple[str, LotAssertion]] = []
        text_objects: dict[str, set[str]] = {"title": set(), "lead": set()}  # object concepts named unambiguously
        for name, (lang, value) in fields.items():
            toks = tokens(value)
            for entries, a, b in self.snap.gazetteer.find(lang, toks):
                start, end = toks[a].start, toks[b - 1].end
                position = "title" if name.startswith("title") else ("lead" if start < LEAD_CHARS else "note")
                # Context cues do not cross punctuation: in "goût Louis XIV, XIXe siècle" the century is dated.
                window = _CLAUSE_BREAK.split(value[max(0, start - CONTEXT_CHARS):start])[-1]
                before = normalize_term(window) + " "
                after = " " + normalize_term(value[end:end + 15])
                shared = len({e.concept_key for e in entries}) > 1
                for e in {e.concept_key: e for e in entries}.values():
                    assertion, key = self._context_assertion(e.concept_key, e.dimension, before, position, after)
                    dim = self.snap.concepts[key].dimension if key in self.snap.concepts else e.dimension
                    conf = POSITION_CONFIDENCE[position] * self._concept_factor(key)
                    candidate = LotAssertion(key, dim, assertion, round(conf, 3), "rule", name, position,
                                             _quote(value, start, end))
                    if e.ambiguous or shared:
                        pending_ambiguous.append((e.concept_key, candidate))
                    else:
                        unambiguous.add(e.concept_key)
                        if assertion == "classified_as":
                            text_objects[position].add(key)
                        keep(candidate)
        for concept_key, candidate in pending_ambiguous:
            if concept_key in unambiguous:
                keep(candidate)  # the same concept is also named unambiguously: the context confirms it
            elif candidate.position != "note":
                ambiguous_only.add(concept_key)

        # A concept with a real assertion does not also need a 'mentions' row.
        strong = {k for (k, a) in found if a != "mentions"}
        assertions = [a for (k, x), a in found.items() if not (x == "mentions" and k in strong)]
        reasons = self._review_reasons(assertions, ambiguous_only, text_objects)
        return LotClassification(lot, sorted(assertions, key=lambda a: (a.dimension, a.concept_key, a.assertion)),
                                 bool(reasons), reasons)

    def _review_reasons(self, assertions: list[LotAssertion], ambiguous: set[str],
                        text_objects: dict[str, set[str]]) -> list[str]:
        reasons = []
        objects = [a for a in assertions if a.assertion == "classified_as"]
        if not objects:
            reasons.append("no object classification")
        source_objects = [a for a in objects if a.method == "source_category"]
        # The title names the lot; the opening lines often name parts or accessories ("dans un cadre doré").
        named = text_objects["title"] or text_objects["lead"]
        if named and source_objects:
            text_tops = {self.snap.top_category(k) for k in named} - {None}
            source_tops = {self.snap.top_category(a.concept_key) for a in source_objects} - {None} - CULTURE_CATEGORIES
            if text_tops and source_tops and not text_tops & source_tops:
                reasons.append("Drouot category and text disagree")
        periods = [self.snap.concepts[a.concept_key] for a in assertions if a.assertion == "dated_to"]
        for i, p in enumerate(periods):
            for q in periods[i + 1:]:
                if (p.start_year and p.end_year and q.start_year and q.end_year
                        and (p.end_year < q.start_year or q.end_year < p.start_year)
                        and p.key not in self.snap.ancestors(q.key) and q.key not in self.snap.ancestors(p.key)):
                    reasons.append(f"conflicting dating ({p.key} / {q.key})")
        # An ambiguous word matters only when it would be the lot's sole object classification from text
        # (French "or" occurs in thousands of texts as a conjunction; that alone is not worth a review).
        ambiguous_objects = {k for k in ambiguous if self.snap.concepts.get(k) and
                             self.snap.concepts[k].dimension in ("category", "subcategory", "object_type")}
        if ambiguous_objects and not (text_objects["title"] or text_objects["lead"]):
            reasons.append("ambiguous term only: " + ", ".join(sorted(ambiguous_objects)))
        return reasons


def classify_many(classifier: Classifier, lots: Iterable[SourceLot]) -> list[LotClassification]:
    return [classifier.classify(lot) for lot in lots]
