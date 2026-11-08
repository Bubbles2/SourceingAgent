"""The taxonomy's controlled vocabulary: dimensions, term types, relationship types and their rules.

This module is the single Python source of truth. Migration ``0001`` writes the same values into
the lookup tables of the ``auction_search`` schema (migrations must not import application code,
so the values are copied there); ``tests/test_taxonomy_db.py`` fails if the two ever differ.

Key modelling decisions:

* **Synonyms and translations are terms, not relationships.** A concept has one preferred label
  per language and any number of synonyms / spelling variants. "Bottines" (fr) and "ankle boots"
  (en) are labels of the same concept, so a translation is simply a label in another language.
* **Period and style are different dimensions.** ``period.louis_xiv`` (made 1643–1715) and
  ``style.louis_xiv`` (the idiom, also used by later makers) are separate concepts linked by the
  typed relationship ``originated_in_period`` — never by ``broader`` and never as synonyms.
* **Relationship rules are enforced by PostgreSQL**: each relationship row carries the dimensions of
  both ends (kept honest by composite foreign keys) and a foreign key to the allowed
  (type, source dimension, target dimension) triples.
"""

from __future__ import annotations

from dataclasses import dataclass

# --------------------------------------------------------------------------------------
# Dimensions
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Dimension:
    code: str
    label_en: str
    label_fr: str
    description: str


DIMENSIONS: dict[str, Dimension] = {
    d.code: d
    for d in (
        Dimension("category", "Category", "Catégorie",
                  "Top-level auction department, e.g. Furniture, Fine art, Fashion."),
        Dimension("subcategory", "Subcategory", "Sous-catégorie",
                  "Grouping inside a category, e.g. Footwear within Fashion, Seating within Furniture."),
        Dimension("object_type", "Object type", "Type d'objet",
                  "What the object is, e.g. ankle boots, commode, armchair."),
        Dimension("period", "Historical period", "Époque",
                  "When an object was made (dating). Carries start/end years."),
        Dimension("style", "Style", "Style",
                  "Stylistic idiom. An object can be in a style long after the period that created it."),
        Dimension("region", "Country or region", "Pays ou région", "Place or culture of origin."),
        Dimension("material", "Material", "Matériau", "What the object is made of."),
        Dimension("technique", "Technique", "Technique", "How it was made or decorated, e.g. Boulle marquetry."),
        Dimension("maker", "Maker, artist or brand", "Auteur, artiste ou marque",
                  "Person, workshop, manufacture or brand; attributes.kind gives which."),
    )
}

CLASSIFICATION_DIMENSIONS = ("category", "subcategory", "object_type")
ALL_DIMENSIONS = tuple(DIMENSIONS)

# --------------------------------------------------------------------------------------
# Terms
# --------------------------------------------------------------------------------------

TERM_TYPES: dict[str, str] = {
    "preferred": "The preferred label in that language (at most one per concept and language).",
    "synonym": "Another label with the same meaning in that language.",
    "spelling_variant": "Alternative spelling or historical form, e.g. 'Buhl' for 'Boulle'.",
    "abbreviation": "Abbreviation or acronym.",
    "hidden": "Matched but never displayed, e.g. a frequent misspelling.",
}

# ISO 639-1/639-2 code; "und" = language-neutral (brand names, proper names).
LANGUAGE_PATTERN = r"^[a-z]{2,3}$"
REQUIRED_LANGUAGES = ("fr", "en")

# --------------------------------------------------------------------------------------
# Relationships between concepts
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RelationshipType:
    code: str
    label_en: str
    inverse_label_en: str
    is_hierarchical: bool
    is_symmetric: bool
    is_transitive: bool
    expansion_weight: float  # default weight when used for query expansion (Phase 7)
    description: str


RELATIONSHIP_TYPES: dict[str, RelationshipType] = {
    r.code: r
    for r in (
        RelationshipType("broader", "has broader concept", "has narrower concept", True, False, True, 1.0,
                         "Is-a / part-of hierarchy inside compatible dimensions (ankle boots → boots → footwear)."),
        RelationshipType("related", "is related to", "is related to", False, True, False, 0.4,
                         "Generic association. Stored once, with source id < target id."),
        RelationshipType("originated_in_period", "originated in period", "period saw the origin of style",
                         False, False, False, 0.7,
                         "A style and the period that created it. NOT a synonym: later objects can share the style."),
        RelationshipType("revival_of", "is a revival of", "was revived by", False, False, False, 0.5,
                         "A later style reviving an earlier one (Napoleon III revival of Louis XIV)."),
        RelationshipType("associated_technique", "is associated with technique", "is a technique associated with",
                         False, False, False, 0.5, "Technique characteristic of a style, period, object type or maker."),
        RelationshipType("associated_material", "is associated with material", "is a material associated with",
                         False, False, False, 0.4, "Material characteristic of a style, technique, object type or maker."),
        RelationshipType("named_after", "is named after", "gave its name to", False, False, False, 0.5,
                         "A technique, style or object type named after a maker (Boulle marquetry → A.-C. Boulle)."),
        RelationshipType("active_in_period", "was active in period", "period of activity of", False, False, False,
                         0.5, "A maker's period of activity."),
        RelationshipType("associated_region", "is associated with region", "is a region associated with",
                         False, False, False, 0.3, "Place or culture associated with a style, period, maker, etc."),
        RelationshipType("characteristic_object", "is characteristic of object type", "is an object type typical of",
                         False, False, False, 0.5,
                         "Object types typical of a style, technique or maker (Louis Vuitton → luggage)."),
    )
}

_SAME = ("period", "style", "region", "material", "technique", "maker")
_ANY = ALL_DIMENSIONS

# (relationship type) -> list of (allowed source dimensions, allowed target dimensions)
_RULE_SPEC: dict[str, list[tuple[tuple[str, ...], tuple[str, ...]]]] = {
    "broader": [
        (("category",), ("category",)),
        (("subcategory",), ("category", "subcategory")),
        (("object_type",), ("category", "subcategory", "object_type")),
        *[((d,), (d,)) for d in _SAME],
    ],
    "related": [(_ANY, _ANY)],
    "originated_in_period": [(("style",), ("period",))],
    "revival_of": [(("style",), ("style",))],
    "associated_technique": [
        (("style", "period", "region", "maker", "material", "category", "subcategory", "object_type"), ("technique",))
    ],
    "associated_material": [
        (("style", "period", "region", "maker", "technique", "category", "subcategory", "object_type"), ("material",))
    ],
    "named_after": [(("technique", "style", "material", "category", "subcategory", "object_type"), ("maker",))],
    "active_in_period": [(("maker",), ("period",))],
    "associated_region": [
        (("style", "period", "maker", "technique", "material", "category", "subcategory", "object_type"), ("region",))
    ],
    "characteristic_object": [
        (("style", "period", "region", "maker", "technique", "material"), CLASSIFICATION_DIMENSIONS)
    ],
}

RELATIONSHIP_RULES: frozenset[tuple[str, str, str]] = frozenset(
    (rel, s, t) for rel, specs in _RULE_SPEC.items() for sources, targets in specs for s in sources for t in targets
)

# --------------------------------------------------------------------------------------
# Lot ↔ concept assertions (auction_search.lot_concepts)
# --------------------------------------------------------------------------------------

# What a lot-to-concept link *asserts*. "dated_to" (made in the period) and "in_style_of" are
# different assertions on different dimensions, so a Napoleon III commode in Louis XIV style is
# in_style_of style.louis_xiv + dated_to period.napoleon_iii — never dated_to period.louis_xiv.
LOT_ASSERTIONS: dict[str, tuple[str, ...]] = {
    "classified_as": CLASSIFICATION_DIMENSIONS,
    "dated_to": ("period",),
    "in_style_of": ("style",),
    "made_by": ("maker",),
    "attributed_to": ("maker",),     # attribué à
    "workshop_of": ("maker",),       # atelier de
    "circle_of": ("maker",),         # entourage de / cercle de
    "follower_of": ("maker",),       # suiveur de / école de
    "after": ("maker",),             # d'après
    "made_of": ("material",),
    "uses_technique": ("technique",),
    "originates_from": ("region",),
    "mentions": ALL_DIMENSIONS,      # weak link: the concept is mentioned, nothing more is asserted
}

LOT_ASSERTION_RULES: frozenset[tuple[str, str]] = frozenset(
    (assertion, dim) for assertion, dims in LOT_ASSERTIONS.items() for dim in dims
)

# --------------------------------------------------------------------------------------
# Workflow values (check constraints)
# --------------------------------------------------------------------------------------

REVIEW_STATUSES = ("candidate", "approved", "rejected")
VERSION_STATUSES = ("draft", "published", "retired")
PROVENANCES = ("seed", "source_category", "rule_extraction", "ai_extraction", "manual", "search_feedback")
CLASSIFICATION_METHODS = ("rule", "source_category", "ai", "manual")
