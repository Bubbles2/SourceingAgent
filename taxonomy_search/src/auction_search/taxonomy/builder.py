"""Turn extraction mentions into reviewed-ready taxonomy candidates (Phase 3, rules only).

Steps:

1. **Group** pattern mentions by (dimension, lemma of label) and gazetteer mentions by concept.
2. **Filter**: keep groups seen in at least ``min_lots`` lots; drop object-type candidates that are
   really maker names or that collide with an existing concept of another dimension.
3. **Match** groups to existing concepts (same lemma, compatible dimension) → *attestation*
   (evidence for an existing concept) instead of a new candidate.
4. **Translate**: English label from the rule (centuries, lexicons, "X period"/"X style") or by
   *alignment*: every lot has French and English text, so the English unigram/bigram whose lots
   best overlap the French term's lots (Dice coefficient) is its likely translation.
5. **Parents**: compound object types ("table de chevet") → their head noun; other object types →
   the Drouot category most of their lots belong to (via ``source_category_mappings``); "Style X"
   ↔ "Époque X" → ``originated_in_period``.
6. **Confidence** = rule prior × support (saturates at 10 lots) × penalties (one auction only, no
   English label).
7. **Suggestions** for review only: spelling variants (near-identical lemmas) and synonyms (two French
   terms aligned to the same English term).
"""

from __future__ import annotations

import json
import logging
import math
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, text

from auction_search.enrichment.extraction import PRIORS, Gazetteer, LotExtraction, Mention
from auction_search.enrichment.lexicons import EN_STOPWORDS
from auction_search.enrichment.text import capitalize_first, english_ordinal, lemma
from auction_search.taxonomy.normalization import normalize_term
from auction_search.taxonomy.vocabulary import CLASSIFICATION_DIMENSIONS, RELATIONSHIP_RULES

log = logging.getLogger(__name__)

MAX_ALIGNMENT_LOTS = 400   # lots sampled per candidate for English alignment
MAX_EN_TOKENS = 200        # English tokens per lot used for alignment
MIN_DICE = 0.2             # below this, no English translation is proposed
PARENT_SHARE = 0.5         # share of a candidate's lots needed in one Drouot category to propose it as parent
CULTURE_DEPARTMENTS = ("world_arts",)  # key prefixes of departments organised by culture, not object type


@dataclass
class Evidence:
    lot_id: int
    source: str
    source_lot_id: str
    auction_key: str
    field: str
    quote: str
    extractor: str


@dataclass
class Candidate:
    key: str
    dimension: str
    label_fr: str
    label_en: str | None
    en_source: str | None          # "rule" | "alignment" | None
    en_dice: float | None
    lemma: str
    lots: int
    auctions: int
    confidence: float
    extractors: dict[str, int]
    broader: str | None = None
    broader_reason: str | None = None
    relationships: list[tuple[str, str]] = field(default_factory=list)   # (type, target key)
    start_year: int | None = None
    end_year: int | None = None
    assertions: dict[str, int] = field(default_factory=dict)
    top_categories: list[tuple[str, int]] = field(default_factory=list)
    surfaces: dict[str, int] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    lot_ids: list[int] = field(default_factory=list)


@dataclass
class Attestation:
    concept_key: str
    dimension: str
    lots: int
    auctions: int
    via: dict[str, int]                     # extractor -> lots
    ambiguous_lots: int
    top_categories: list[tuple[str, int]]
    surfaces: dict[str, int]
    evidence: list[Evidence]
    lot_ids: list[int]
    en_labels: list[str] = field(default_factory=list)
    en_alignment: str | None = None
    en_dice: float | None = None


@dataclass
class BuildResult:
    generated_at: str
    params: dict[str, Any]
    lots: int
    candidates: list[Candidate]
    attested: list[Attestation]
    below_threshold: dict[str, int]
    dropped: dict[str, int]
    variant_suggestions: list[dict[str, Any]]
    synonym_suggestions: list[dict[str, Any]]
    ai_tokens_used: int = 0

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> BuildResult:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["candidates"] = [Candidate(**{**c, "evidence": [Evidence(**e) for e in c["evidence"]],
                                           "relationships": [tuple(r) for r in c["relationships"]],
                                           "top_categories": [tuple(t) for t in c["top_categories"]]})
                              for c in data["candidates"]]
        data["attested"] = [Attestation(**{**a, "evidence": [Evidence(**e) for e in a["evidence"]],
                                          "top_categories": [tuple(t) for t in a["top_categories"]]})
                            for a in data["attested"]]
        return cls(**data)


@dataclass
class _Group:
    dimension: str
    key: str
    labels: Counter[str] = field(default_factory=Counter)
    labels_en: Counter[str] = field(default_factory=Counter)
    extractors: Counter[str] = field(default_factory=Counter)
    lots: set[int] = field(default_factory=set)
    auctions: set[str] = field(default_factory=set)
    categories: Counter[str] = field(default_factory=Counter)
    assertions: Counter[str] = field(default_factory=Counter)
    parents: Counter[str] = field(default_factory=Counter)
    years: list[list[int | None]] = field(default_factory=list)
    ambiguous: set[int] = field(default_factory=set)
    evidence: list[Evidence] = field(default_factory=list)

    def add(self, rec: LotExtraction, m: Mention, max_evidence: int) -> None:
        self.labels[m.label] += 1
        if m.label_en:
            self.labels_en[m.label_en] += 1
        self.extractors[m.extractor] += 1
        if m.assertion:
            self.assertions[m.assertion] += 1
        if m.parent_key:
            self.parents[m.parent_key] += 1
        if m.years:
            self.years.append(m.years)
        if m.ambiguous:
            self.ambiguous.add(rec.lot_id)
        if rec.lot_id not in self.lots and rec.category_fr:
            self.categories[rec.category_fr] += 1
        self.lots.add(rec.lot_id)
        new_auction = rec.auction_key not in self.auctions
        self.auctions.add(rec.auction_key)
        if len(self.evidence) < max_evidence and (new_auction or len(self.auctions) < max_evidence):
            self.evidence.append(Evidence(rec.lot_id, rec.source, rec.source_lot_id, rec.auction_key, m.field,
                                          m.quote, m.extractor))


# --------------------------------------------------------------------------------------
# English alignment
# --------------------------------------------------------------------------------------


def _usable(token: str) -> bool:
    return token not in EN_STOPWORDS and len(token) > 2 and not any(ch.isdigit() for ch in token)


def _ngrams(en_tokens: str) -> set[str]:
    toks = en_tokens.split()[:MAX_EN_TOKENS]
    grams = {t for t in toks if _usable(t)}
    grams |= {f"{a} {b}" for a, b in zip(toks, toks[1:]) if _usable(a) and _usable(b)}
    return grams


class Aligner:
    """Finds the English n-gram that best co-occurs (Dice) with a set of lots.

    ``lead=True`` uses only the English title and first words of the description, where object
    names are; otherwise the whole English text. An n-gram must co-occur in at least two auctions
    when the term spans several, which filters out one catalogue's boilerplate ("Sold without…").
    """

    def __init__(self, records: list[LotExtraction], lead: bool = False) -> None:
        self.tokens = {r.lot_id: (r.en_lead if lead else r.en_tokens) for r in records}
        self.auction = {r.lot_id: r.auction_key for r in records}
        self.df: Counter[str] = Counter()
        for r in records:
            self.df.update(_ngrams(self.tokens[r.lot_id]))

    def best(self, lot_ids: set[int] | list[int]) -> tuple[str, float] | None:
        ids = sorted(lot_ids)
        n = len(ids)
        sample = ids[:MAX_ALIGNMENT_LOTS]
        co: Counter[str] = Counter()
        co_auctions: dict[str, set[str]] = defaultdict(set)
        for lot_id in sample:
            for gram in _ngrams(self.tokens.get(lot_id, "")):
                co[gram] += 1
                co_auctions[gram].add(self.auction.get(lot_id, ""))
        need_auctions = 2 if len({self.auction.get(i) for i in sample}) > 1 else 1
        scale = n / len(sample) if sample else 1
        scores = {gram: 2 * c * scale / (n + self.df[gram]) for gram, c in co.items()
                  if c * scale >= 2 and len(co_auctions[gram]) >= need_auctions}
        if not scores:
            return None
        gram, score = max(scores.items(), key=lambda kv: (kv[1], kv[0]))
        # Prefer the more specific bigram ("snuff bottle") when it scores almost as well as its word.
        longer = [(g, s) for g, s in scores.items() if " " in g and gram in g.split() and s >= score - 0.05]
        if " " not in gram and longer:
            gram, score = max(longer, key=lambda kv: (kv[1], kv[0]))
        return (gram, round(min(score, 1.0), 3)) if score >= MIN_DICE else None


# --------------------------------------------------------------------------------------
# Existing taxonomy
# --------------------------------------------------------------------------------------


@dataclass
class ExistingTaxonomy:
    keys: dict[str, str]                                  # concept key -> dimension
    by_lemma: dict[tuple[str, str], set[str]]             # (language, lemma) -> concept keys
    en_labels: dict[str, list[str]]                       # concept key -> English terms
    category_map: dict[str, list[tuple[str, str]]]        # Drouot category_fr -> [(concept key, assertion)]

    @classmethod
    def from_database(cls, conn: Connection, schema: str, gazetteer: Gazetteer) -> ExistingTaxonomy:
        keys = {k: d for k, d in conn.execute(text(f'select concept_key, dimension from "{schema}".taxonomy_concepts'))}
        by_lemma: dict[tuple[str, str], set[str]] = defaultdict(set)
        en_labels: dict[str, list[str]] = defaultdict(list)
        for e in gazetteer.entries:
            for lang in (("fr", "en") if e.language == "und" else (e.language,)):
                by_lemma[(lang, " ".join(e.lemma_tokens))].add(e.concept_key)
            if e.language in ("en", "und"):
                en_labels[e.concept_key].append(e.term)
        category_map: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for cat, key, assertion in conn.execute(text(
                f'select m.category_fr, c.concept_key, m.assertion from "{schema}".source_category_mappings m '
                f'join "{schema}".taxonomy_concepts c on c.id = m.concept_id where m.review_status <> \'rejected\'')):
            if cat:
                category_map[cat].append((key, assertion))
        return cls(keys, by_lemma, en_labels, category_map)


def _compatible(a: str, b: str) -> bool:
    return a == b or (a in CLASSIFICATION_DIMENSIONS and b in CLASSIFICATION_DIMENSIONS)


_PREFIX = re.compile(r"^(epoque|style) ")


def _slug(lemma_key: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", _PREFIX.sub("", lemma_key)).strip("_")
    return slug if slug and slug[0].isalpha() else f"x_{slug}"


# --------------------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------------------


def build_candidates(records: list[LotExtraction], gazetteer: Gazetteer, existing: ExistingTaxonomy,
                     min_lots: int = 3, max_evidence: int = 5) -> BuildResult:
    groups: dict[tuple[str, str], _Group] = {}
    attest: dict[str, _Group] = {}
    for rec in records:
        for m in rec.mentions:
            if m.extractor == "gazetteer":
                g = attest.setdefault(m.concept_key or m.key, _Group(m.dimension, m.concept_key or m.key))
            else:
                g = groups.setdefault((m.dimension, m.key), _Group(m.dimension, m.key))
            g.add(rec, m, max_evidence)

    aligner = Aligner(records)
    lead_aligner = Aligner(records, lead=True)
    below: Counter[str] = Counter()
    dropped: Counter[str] = Counter()
    maker_lemmas = {lemma(normalize_term(g.labels.most_common(1)[0][0]))
                    for (dim, _), g in groups.items() if dim == "maker" and len(g.lots) >= min_lots}

    kept: dict[tuple[str, str], _Group] = {}
    for (dim, key), g in groups.items():
        if len(g.lots) < min_lots:
            below[dim] += 1
            continue
        label_lemma = lemma(normalize_term(g.labels.most_common(1)[0][0]))
        matches = existing.by_lemma.get(("fr", label_lemma), set())
        same_dim = sorted(k for k in matches if _compatible(dim, existing.keys.get(k, "")))
        if same_dim:
            target = attest.setdefault(same_dim[0], _Group(existing.keys[same_dim[0]], same_dim[0]))
            for lot in g.lots:
                target.lots.add(lot)
            target.auctions |= g.auctions
            target.extractors.update({f"pattern:{x}": n for x, n in g.extractors.items()})
            dropped[f"{dim}: matches an existing concept"] += 1
            continue
        if matches:
            dropped[f"{dim}: label belongs to an existing concept of another dimension"] += 1
            continue
        if dim == "object_type" and label_lemma in maker_lemmas:
            dropped["object_type: is a maker/brand name"] += 1
            continue
        if dim == "maker" and set(g.extractors) == {"brand_header"} and len(g.auctions) == 1:
            # e.g. 'ECHTERNACH. Réunion de 50 photographies…' — a place heading one catalogue
            dropped["maker: capitalised title heading in a single auction only"] += 1
            continue
        kept[(dim, key)] = g

    # Assign keys first so that relationships between new candidates can refer to them.
    taken = set(existing.keys)
    keys: dict[tuple[str, str], str] = {}
    by_lemma_new: dict[tuple[str, str], str] = {}
    parents: dict[tuple[str, str], tuple[str, str]] = {}
    for (dim, key), g in sorted(kept.items()):
        parent, reason = _propose_parent(dim, g, existing, len(g.lots))
        if parent:
            parents[(dim, key)] = (parent, reason)
        if key.startswith("century:"):
            base = f"period.{english_ordinal(int(key.split(':')[1]))}_century"
        elif dim == "object_type" and parent and not g.parents and existing.keys.get(parent) in CLASSIFICATION_DIMENSIONS:
            base = f"{parent}.{_slug(key)}"  # compounds keep a flat key: their parent is their head noun
        else:
            base = f"{dim}.{_slug(key)}"
        candidate_key, n = base, 2
        while candidate_key in taken:
            candidate_key, n = f"{base}_{n}", n + 1
        taken.add(candidate_key)
        keys[(dim, key)] = candidate_key
        by_lemma_new[(dim, key)] = candidate_key

    candidates: list[Candidate] = []
    for (dim, key), g in sorted(kept.items()):
        label_fr = g.labels.most_common(1)[0][0]
        label_en, en_source, dice = None, None, None
        if g.labels_en:
            label_en, en_source = g.labels_en.most_common(1)[0][0], "rule"
            found = aligner.best(g.lots)
            if found:
                dice = found[1]
            # "Style archaïque" → the template gives "archaïque style"; a lower-case word is a French
            # adjective, so prefer the aligned English term when there is a convincing one.
            name_part = label_fr.split(" ", 1)[-1]
            french_word = (dim in ("style", "period") and label_fr.startswith(("Style ", "Époque "))
                           and name_part == name_part.lower())
            if french_word and found and found[1] >= 0.4:
                label_en, en_source = capitalize_first(found[0]), "alignment"
            elif french_word:
                en_source = f"rule (French word '{name_part}' kept)"
            elif (dim in ("style", "period") and label_fr.startswith(("Style ", "Époque ")) and found
                  and found[1] >= 0.5 and not set(found[0].split()) & set(lemma(normalize_term(name_part)).split())):
                # A French proper name with a different English form: "Restauration" → "Restoration".
                suffix = "style" if dim == "style" else "period"
                words = [w for w in found[0].split() if w != suffix]
                label_en = " ".join(w.capitalize() for w in words) + f" {suffix}"
                en_source = "alignment"
        elif dim != "maker":
            if found := (lead_aligner if dim == "object_type" else aligner).best(g.lots):
                label_en, en_source, dice = capitalize_first(found[0]), "alignment", found[1]
        else:
            label_en, en_source = label_fr, "rule"  # names are not translated

        rels: list[tuple[str, str]] = []
        broader, broader_reason = None, None
        if dim == "object_type" and g.parents:
            head = g.parents.most_common(1)[0][0]
            head_key = by_lemma_new.get(("object_type", head)) or next(
                iter(sorted(k for k in existing.by_lemma.get(("fr", head), set())
                            if existing.keys.get(k) in CLASSIFICATION_DIMENSIONS)), None)
            if head_key:
                broader, broader_reason = head_key, f"head noun of the compound ('{head}')"
        if broader is None and (dim, key) in parents:
            broader, broader_reason = parents[(dim, key)]

        years = [y for y in g.years if y]
        start = min((y[0] for y in years if y[0]), default=None)
        end = max((y[1] for y in years if y[1]), default=None)
        if start and end and start > end:
            start, end = None, None

        prior = max(PRIORS.get(x, 0.5) for x in g.extractors)
        support = min(1.0, math.log2(1 + len(g.lots)) / math.log2(11))
        confidence = prior * support * (0.8 if len(g.auctions) == 1 else 1.0) * (1.0 if label_en else 0.9)
        candidates.append(Candidate(
            key=keys[(dim, key)], dimension=dim, label_fr=label_fr, label_en=label_en, en_source=en_source,
            en_dice=dice, lemma=key, lots=len(g.lots), auctions=len(g.auctions), confidence=round(confidence, 3),
            extractors=dict(g.extractors.most_common()), broader=broader, broader_reason=broader_reason,
            relationships=rels, start_year=start, end_year=end, assertions=dict(g.assertions.most_common()),
            top_categories=g.categories.most_common(5), surfaces=dict(g.labels.most_common(8)),
            evidence=g.evidence, lot_ids=sorted(g.lots),
        ))

    _link_styles_to_periods(candidates, existing)
    attested = _attestations(attest, existing, aligner, lead_aligner)
    return BuildResult(
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        params={"min_lots": min_lots, "max_evidence": max_evidence, "min_dice": MIN_DICE,
                "parent_share": PARENT_SHARE},
        lots=len(records), candidates=candidates, attested=attested,
        below_threshold=dict(below), dropped=dict(dropped),
        variant_suggestions=_variants(candidates, attested), synonym_suggestions=_synonyms(candidates, attested),
    )


def _propose_parent(dim: str, g: _Group, existing: ExistingTaxonomy, n_lots: int) -> tuple[str | None, str | None]:
    if dim != "object_type" or not g.categories:
        return None, None
    category, count = g.categories.most_common(1)[0]
    if count / n_lots < PARENT_SHARE:
        return None, None
    # Culture-based departments (Asian art, Islamic art, …) say where an object comes from, not what it
    # is: a bowl sold in "Arts d'Asie" is not a kind of Asian art, so they are never proposed as parents.
    targets = [k for k, assertion in existing.category_map.get(category, [])
               if assertion == "classified_as" and not k.startswith(CULTURE_DEPARTMENTS)]
    if not targets:
        return None, None
    return targets[0], f"{count}/{n_lots} lots in Drouot category '{category}'"


def _link_styles_to_periods(candidates: list[Candidate], existing: ExistingTaxonomy) -> None:
    """'Style X' (candidate) ↔ 'Époque X' (candidate or existing) → originated_in_period."""
    periods: dict[str, str] = {}
    for c in candidates:
        if c.dimension == "period" and c.lemma.startswith("epoque "):
            periods[c.lemma[len("epoque "):]] = c.key
    for (lang, lem), keys in existing.by_lemma.items():
        if lang == "fr" and lem.startswith("epoque "):
            for k in keys:
                if existing.keys.get(k) == "period":
                    periods.setdefault(lem[len("epoque "):], k)
    for c in candidates:
        if c.dimension == "style" and c.lemma.startswith("style "):
            target = periods.get(c.lemma[len("style "):])
            if target and ("originated_in_period", "style", "period") in RELATIONSHIP_RULES:
                c.relationships.append(("originated_in_period", target))


def _attestations(attest: dict[str, _Group], existing: ExistingTaxonomy, aligner: Aligner,
                  lead_aligner: Aligner) -> list[Attestation]:
    out = []
    for key, g in sorted(attest.items()):
        en = existing.en_labels.get(key, [])
        dim = existing.keys.get(key, g.dimension)
        chosen = lead_aligner if dim in CLASSIFICATION_DIMENSIONS else aligner
        found = chosen.best(g.lots) if len(g.lots) >= 3 else None
        out.append(Attestation(
            concept_key=key, dimension=existing.keys.get(key, g.dimension), lots=len(g.lots),
            auctions=len(g.auctions), via=dict(g.extractors.most_common()), ambiguous_lots=len(g.ambiguous),
            top_categories=g.categories.most_common(5), surfaces=dict(g.labels.most_common(8)),
            evidence=g.evidence, lot_ids=sorted(g.lots), en_labels=en,
            en_alignment=found[0] if found else None, en_dice=found[1] if found else None,
        ))
    return out


def _variants(candidates: list[Candidate], attested: list[Attestation]) -> list[dict[str, Any]]:
    """Near-identical lemmas in the same dimension (possible spelling variants)."""
    items = [(c.dimension, normalize_term(c.label_fr), c.key) for c in candidates]
    out = []
    by_dim: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for dim, lab, key in items:
        by_dim[dim].append((lab, key))
    for dim, labels in by_dim.items():
        labels.sort()
        for i, (a, ka) in enumerate(labels):
            for b, kb in labels[i + 1:]:
                if b[:3] != a[:3]:
                    break
                if len(a) >= 6 and abs(len(a) - len(b)) <= 2 and (r := SequenceMatcher(None, a, b).ratio()) >= 0.9:
                    out.append({"dimension": dim, "a": ka, "b": kb, "label_a": a, "label_b": b, "ratio": round(r, 3)})
    return out


def _synonyms(candidates: list[Candidate], attested: list[Attestation]) -> list[dict[str, Any]]:
    """French terms of one dimension aligned to the same English term (possible synonyms)."""
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for c in candidates:
        if c.en_source == "alignment" and c.label_en and (c.en_dice or 0) >= 0.35:
            groups[(c.dimension, normalize_term(c.label_en))].append(c.key)
    for a in attested:
        if a.en_alignment and (a.en_dice or 0) >= 0.35:
            groups[(a.dimension, normalize_term(a.en_alignment))].append(a.concept_key)
    return [{"dimension": d, "english": en, "concepts": sorted(set(keys))}
            for (d, en), keys in sorted(groups.items()) if len(set(keys)) > 1]
