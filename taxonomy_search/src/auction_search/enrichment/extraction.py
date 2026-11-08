"""Rule-based extraction of taxonomy evidence and candidate terms from lot texts (Phase 3).

Two kinds of output per lot ("mentions"):

* **gazetteer** mentions — known taxonomy terms found in the text (singular/plural tolerant).
  They attest existing concepts and provide evidence quotes.
* **pattern** mentions — candidate *new* terms found by deterministic French catalogue patterns:
  "époque X", centuries, "style X" / "goût X", artist headers "Prénom NOM (1874-1968)", brand
  headers ("GUCCI"), attributions ("attribué à X", "atelier de X", "d'après X"), "par X" / "signé X",
  object heads (first noun of a title), materials ("en bronze doré", "placage de bois de rose"),
  technique and origin words from small lexicons.

No AI is used. Patterns run on the French fields (the catalogue's source language); the English
fields are kept as lemmatised tokens so the candidate builder can align French terms with English
ones. Fields whose content is detected as another language are skipped and counted.

``run_extraction`` processes lots in batches, caches results per lot by content hash, reuses the
result for lots with identical text, and can resume an interrupted run (``--resume``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, Engine, text

from auction_search.database.inspection import StructureReport
from auction_search.database.source import LotSource, SourceLot
from auction_search.enrichment import lexicons as lx
from auction_search.enrichment.text import (
    Token,
    capitalize_first,
    clean,
    display_name,
    english_ordinal,
    int_to_roman,
    is_mostly_upper,
    lemma,
    lemma_token,
    roman_to_int,
    strip_title_prefix,
    tokens,
)
from auction_search.taxonomy.normalization import normalize_term
from auction_search.text.language import detect_language

log = logging.getLogger(__name__)

EXTRACTOR_VERSION = "3.3"
EN_LEAD_TOKENS = 30  # English title + first words of the description, for aligning object names
QUOTE_CONTEXT = 50

# How much each rule is trusted before support is taken into account (used by the builder).
PRIORS: dict[str, float] = {
    "gazetteer": 0.9, "period_epoque": 0.8, "century": 0.9, "style": 0.75, "maker_header": 0.85,
    "maker_attribution": 0.7, "maker_by": 0.55, "brand_header": 0.5, "object_head": 0.6,
    "object_compound": 0.5, "material_en": 0.45, "material_trigger": 0.65, "technique_lexicon": 0.6,
    "region_lexicon": 0.6,
}


@dataclass
class Mention:
    extractor: str
    dimension: str
    language: str
    field: str
    label: str            # display label of the candidate (or the matched term for gazetteer)
    key: str              # grouping key: lemma of the normalised label, or a canonical id
    start: int
    end: int
    quote: str = ""
    concept_key: str | None = None   # gazetteer: the existing concept matched
    ambiguous: bool = False
    assertion: str | None = None     # e.g. attributed_to, made_by
    years: list[int | None] | None = None
    label_en: str | None = None      # English label given by the rule itself (centuries, lexicons)
    parent_key: str | None = None    # compound object types: key of the head noun
    qualifier: str | None = None     # e.g. "fin" in "fin du XIXe siècle"


@dataclass
class LotExtraction:
    lot_id: int
    source: str
    source_lot_id: str
    auction_key: str
    category_fr: str | None
    category_en: str | None
    content_hash: str
    fingerprint: str
    mentions: list[Mention]
    en_tokens: str                   # lemmatised English tokens, space separated (for alignment)
    skipped_fields: list[str] = field(default_factory=list)
    en_lead: str = ""                # lemmatised English title + start of description

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def from_json(cls, line: str) -> LotExtraction:
        data = json.loads(line)
        data["mentions"] = [Mention(**m) for m in data["mentions"]]
        return cls(**data)


# --------------------------------------------------------------------------------------
# Gazetteer: known taxonomy terms
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class GazetteerEntry:
    concept_key: str
    dimension: str
    language: str
    term: str
    term_type: str
    ambiguous: bool
    lemma_tokens: tuple[str, ...]


class Gazetteer:
    def __init__(self, entries: Iterable[GazetteerEntry]) -> None:
        self.entries = sorted(set(entries), key=lambda e: (e.concept_key, e.language, e.term))
        self._index: dict[tuple[str, str], list[GazetteerEntry]] = defaultdict(list)
        for e in self.entries:
            if not e.lemma_tokens:
                continue
            for lang in (("fr", "en") if e.language == "und" else (e.language,)):
                self._index[(lang, e.lemma_tokens[0])].append(e)
        for bucket in self._index.values():
            bucket.sort(key=lambda e: -len(e.lemma_tokens))
        self.fingerprint = hashlib.sha256(
            "\n".join(f"{e.concept_key}|{e.language}|{e.term}|{e.ambiguous}" for e in self.entries).encode()
        ).hexdigest()[:16]

    @classmethod
    def from_rows(cls, rows: Iterable[tuple[str, str, str, str, str, bool]]) -> Gazetteer:
        return cls(GazetteerEntry(key, dim, lang, term, ttype, bool(amb), tuple(lemma(normalize_term(term)).split()))
                   for key, dim, lang, term, ttype, amb in rows)

    @classmethod
    def from_database(cls, conn: Connection, schema: str) -> Gazetteer:
        """All non-rejected, non-retired terms of non-rejected concepts (candidates included)."""
        rows = conn.execute(text(
            f'select c.concept_key, c.dimension, t.language, t.term, t.term_type, t.is_ambiguous '
            f'from "{schema}".taxonomy_terms t join "{schema}".taxonomy_concepts c on c.id = t.concept_id '
            f"where t.review_status <> 'rejected' and c.review_status <> 'rejected' "
            f"and t.retired_in_version_id is null and c.retired_in_version_id is null")).all()
        return cls.from_rows(rows)  # type: ignore[arg-type]

    def concepts_for(self, language: str, lemma_key: str) -> list[GazetteerEntry]:
        toks = tuple(lemma_key.split())
        if not toks:
            return []
        return [e for e in self._index.get((language, toks[0]), []) if e.lemma_tokens == toks]

    def find(self, language: str, toks: list[Token]) -> list[tuple[list[GazetteerEntry], int, int]]:
        """Longest non-overlapping matches: (entries sharing the matched words, first token, last token+1)."""
        lem = [lemma_token(t.norm) for t in toks]
        out = []
        i = 0
        while i < len(lem):
            bucket = self._index.get((language, lem[i]), [])
            hit = next((e for e in bucket if tuple(lem[i:i + len(e.lemma_tokens)]) == e.lemma_tokens), None)
            if hit is None:
                i += 1
                continue
            n = len(hit.lemma_tokens)
            same = [e for e in bucket if e.lemma_tokens == hit.lemma_tokens]
            out.append((same, i, i + n))
            i += n
        return out


# --------------------------------------------------------------------------------------
# Pattern helpers
# --------------------------------------------------------------------------------------

_LATIN = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ"
_WORD = rf"[{_LATIN}][{_LATIN}'’-]*"  # Latin script only: CJK inscriptions are not candidate labels
_UPPER_START = "A-ZÀ-ÖØ-Þ"
_NAME_TOKEN = rf"[{_UPPER_START}][\w'’.-]*"
_NAME = rf"{_NAME_TOKEN}(?:\s+(?:(?:de|du|des|van|von|der|den|di|da|del|della|le|la|y)\s+)?{_NAME_TOKEN}){{0,3}}"
_EDGE_PUNCT = "«»\"“”'’()[],.;:!?"


def _quote(text_: str, start: int, end: int) -> str:
    a, b = max(0, start - QUOTE_CONTEXT), min(len(text_), end + QUOTE_CONTEXT)
    return ("…" if a else "") + text_[a:b].strip() + ("…" if b < len(text_) else "")


def _phrase(raw: str, max_tokens: int, stop: frozenset[str]) -> str:
    """Take up to ``max_tokens`` words, stopping at stop words or punctuation."""
    kept: list[str] = []
    for word in raw.split():
        stripped = word.strip(_EDGE_PUNCT)
        if not stripped and not kept:  # a lone opening quote: « famille rose »
            continue
        if not stripped or normalize_term(stripped) in stop or any(ch.isdigit() for ch in stripped):
            break
        if len(stripped) == 1 and roman_to_int(stripped) is None:  # "Art Déco H. 30 cm"
            break
        if kept and len(stripped) > 5 and normalize_term(stripped).endswith("ant"):  # "archaïque représentant"
            break
        kept.append(stripped)
        if len(kept) >= max_tokens or word[-1:] in ",.;:)»\"”":
            break
    return " ".join(kept)


def _mention(extractor: str, dimension: str, field_: str, text_: str, start: int, end: int, label: str,
             key: str | None = None, **kw: Any) -> Mention:
    return Mention(extractor, dimension, "fr", field_, label, key or lemma(normalize_term(label)), start, end,
                   _quote(text_, start, end), **kw)


_EPOQUE = re.compile(rf"(?i:\b(?:d['’]\s*)?[ée]poque)\s+(?P<x>{_WORD}(?:\s+{_WORD}){{0,3}})")
_EPOQUE_REJECT = frozenset("ulterieure posterieure recente indeterminee differente incertaine diverses".split())
_CENTURY = re.compile(
    r"(?i:\b(?:(?P<q>d[ée]but|milieu|fin|premi[èe]re\s+moiti[ée]|seconde\s+moiti[ée]|(?:premier|second|"
    r"troisi[èe]me|dernier)\s+quart)\s+(?:du\s+)?)?(?P<c>[XVI]{1,5}|\d{1,2})\s*(?:e|è|ème|eme)\s+si[èe]cle)"
)
_EPOQUE_CENTURY = re.compile(r"(?i:\b[ée]poque\s+(?P<c>[XVI]{1,5}|\d{1,2})\s*(?:e|è|ème|eme)\b)")
_ORDINAL_CENTURY = re.compile(r"(?i)^(?:[XVI]+|\d+)(?:e|è|ème|eme)$")
_STYLE = re.compile(rf"(?i:\bstyle)\s+(?P<x>[«\"“]?\s*{_WORD}(?:\s+[«»\"“”]?{_WORD}[»\"”]?){{0,3}})")
_GOUT = re.compile(rf"(?i:\bgo[uû]t\s+(?:de\s+(?:la\s+|l['’])?|du\s+|d['’])?)(?P<x>{_WORD}(?:\s+{_WORD}){{0,3}})")
_HEADER_LIFE = re.compile(rf"^(?P<name>{_NAME})\s*\((?P<life>[^)]{{0,60}})\)")
_HEADER_SURNAME_FIRST = re.compile(
    rf"^(?P<last>[{_UPPER_START}][{_UPPER_START}'’-]+(?:\s+[{_UPPER_START}][{_UPPER_START}'’-]+)*),\s+"
    rf"(?P<first>[{_UPPER_START}][\w'’-]+(?:\s+[{_UPPER_START}][\w'’-]+)?)\s*\((?P<life>[^)]{{0,60}})\)"
)
_LIFE_YEARS = re.compile(r"(\d{4})\s*[-–]\s*(\d{4})")
_BORN = re.compile(r"(?i:n[ée]e?\s+en\s+)(\d{4})")
_LIFE_OK = re.compile(r"\d{4}|[XVI]+e|(?i:si[èe]cle|n[ée]e?\s)")
_ATTRIB = re.compile(
    rf"(?P<a>(?i:attribu[ée]e?s?\s+[àa]|atelier\s+de|entourage\s+de|cercle\s+de|suiveur\s+de|[ée]cole\s+de|"
    rf"d['’]\s*apr[èe]s|manufacture\s+de|maison))\s+(?P<x>{_NAME})"
)
_BY = re.compile(rf"(?i:\b(?:sign[ée]e?s?|par|estampill[ée]e?s?))\s+(?P<x>{_NAME})")
_LOT_PREFIX = re.compile(r"^[a-z]\s*[-–]\s*")
_MATERIAL_EN = re.compile(rf"(?i:\ben)\s+(?P<x>{_WORD}(?:\s+{_WORD}){{0,4}})")
_MATERIAL_TRIGGER = re.compile(
    rf"(?i:\b(?:placage|plaquage|marqueterie|incrustations?|monture|garniture)\s+(?:de\s+|d['’]\s*|en\s+))"
    rf"(?P<x>{_WORD}(?:\s+{_WORD}){{0,4}})"
)


def _century(n: int, field_: str, text_: str, start: int, end: int, extractor: str,
             qualifier: str | None) -> Mention | None:
    if not 1 <= n <= 21:
        return None
    return _mention(extractor, "period", field_, text_, start, end, f"{int_to_roman(n)}e siècle",
                    key=f"century:{n}", label_en=f"{english_ordinal(n)} century",
                    years=[(n - 1) * 100 + 1, n * 100], qualifier=qualifier)


def _parse_century(value: str) -> int | None:
    return int(value) if value.isdigit() else roman_to_int(value)


def extract_periods_styles(text_: str, field_: str) -> list[Mention]:
    out: list[Mention] = []
    for m in _CENTURY.finditer(text_):
        n = _parse_century(m.group("c"))
        q = normalize_term(m.group("q")) if m.group("q") else None
        if n and (mm := _century(n, field_, text_, m.start(), m.end(), "century", q)):
            out.append(mm)
    for m in _EPOQUE_CENTURY.finditer(text_):
        n = _parse_century(m.group("c"))
        if n and (mm := _century(n, field_, text_, m.start(), m.end(), "century", None)):
            out.append(mm)
    stop = lx.FR_STOPWORDS | {"vers", "circa", "ca", "siecle", "epoque"}
    for m in _EPOQUE.finditer(text_):
        x = _phrase(m.group("x"), 3, stop)
        first = normalize_term(x.split()[0]) if x else ""
        if (not x or first in _EPOQUE_REJECT or first in ("fin", "debut", "milieu") or roman_to_int(x.split()[0])
                or _ORDINAL_CENTURY.match(x.split()[0])):  # centuries are handled by the century rule
            continue
        label = "Époque " + display_name(x)
        out.append(_mention("period_epoque", "period", field_, text_, m.start(), m.end(), label,
                            label_en=display_name(x) + " period"))
    for rx in (_STYLE, _GOUT):
        for m in rx.finditer(text_):
            x = _phrase(m.group("x"), 3, stop)
            if not x or normalize_term(x.split()[0]) in lx.NON_STYLES:
                continue
            label = "Style " + display_name(x)
            out.append(_mention("style", "style", field_, text_, m.start(), m.end(), label,
                                label_en=display_name(x) + " style"))
    return out


def _clean_name(name: str, keep: str = "first") -> str | None:
    """Trim a captured name: split at sentence breaks ('Adeline. Parodie'), drop non-name words."""
    segments: list[list[str]] = [[]]
    for word in name.split():
        segments[-1].append(word.rstrip("."))
        if word.endswith(".") and len(word.rstrip(".")) > 1:  # not an initial like "J."
            segments.append([])
    segments = [s for s in segments if s]
    if not segments:
        return None
    words = segments[0] if keep == "first" else segments[-1]
    while words and normalize_term(words[-1]) in lx.NOT_MAKER_WORDS:
        words.pop()
    if not words or normalize_term(words[0]) in lx.NOT_MAKER_WORDS or normalize_term(words[0]) in lx.REGIONS:
        return None
    # Rulers on coins and medals ("Philippe VI", "François Ier") are not makers.
    if any((w.isupper() and roman_to_int(w)) or normalize_term(w) in ("ier", "ire") for w in words[1:]):
        return None
    joined = " ".join(words).strip(_EDGE_PUNCT)
    return joined if len(joined) >= 3 else None


def _years(life: str) -> list[int | None] | None:
    if m := _LIFE_YEARS.search(life):
        return [int(m.group(1)), int(m.group(2))]
    if m := _BORN.search(life):
        return [int(m.group(1)), None]
    return None


def maker_header(title: str) -> Mention | None:
    """'Kilian METZINGER (1806 - 1869).' or 'BROGER, VERENA (Thalwil, 1943)' at the start of a title."""
    t = _LOT_PREFIX.sub("", title)
    offset = len(title) - len(t)
    if m := _HEADER_SURNAME_FIRST.match(t):
        name, life = f"{m.group('first')} {m.group('last')}", m.group("life")
    elif m := _HEADER_LIFE.match(t):
        name, life = m.group("name"), m.group("life")
    else:
        return None
    if not _LIFE_OK.search(life) or not (name := _clean_name(name, keep="last") or ""):
        return None
    first = normalize_term(name.split()[0])
    if first in lx.FR_QUANTIFIERS or first in lx.NON_OBJECT_HEADS:
        return None
    return _mention("maker_header", "maker", "title_fr", title, offset, offset + m.end(), display_name(name),
                    assertion="made_by", years=_years(life))


def brand_header(title: str, gazetteer: Gazetteer) -> Mention | None:
    """An all-capitals first segment of 1–3 words that is not a known object: 'GUCCI', 'BACCARAT'."""
    t = _LOT_PREFIX.sub("", title)
    segment = re.split(r"[,.:;(]| [-–] ", t, maxsplit=1)[0].strip()
    words = segment.split()
    if not (1 <= len(words) <= 3) or any(ch.isdigit() for ch in segment) or len(segment) < 3:
        return None
    if not is_mostly_upper(segment) or not all(re.fullmatch(r"[\w&'’-]+", w) for w in words):
        return None
    first = normalize_term(words[0])
    if first in lx.FR_QUANTIFIERS or first in lx.NON_OBJECT_HEADS or first in lx.FR_STOPWORDS:
        return None
    for entries, _, _ in gazetteer.find("fr", tokens(segment)):
        if any(e.dimension in ("category", "subcategory", "object_type", "material", "region") for e in entries):
            return None
    start = title.find(segment)
    return _mention("brand_header", "maker", "title_fr", title, start, start + len(segment), display_name(segment),
                    assertion="made_by")


def extract_makers(text_: str, field_: str) -> list[Mention]:
    out: list[Mention] = []
    for m in _ATTRIB.finditer(text_):
        name = _clean_name(m.group("x"))
        if not name:
            continue
        trigger = lemma(normalize_term(m.group("a")))
        assertion = next((a for k, a in lx.ATTRIBUTION_ASSERTIONS.items() if lemma(k) == trigger), "made_by")
        out.append(_mention("maker_attribution", "maker", field_, text_, m.start(), m.end(), display_name(name),
                            assertion=assertion))
    for m in _BY.finditer(text_):
        name = _clean_name(m.group("x"))
        if name:
            out.append(_mention("maker_by", "maker", field_, text_, m.start("x"), m.end(), display_name(name),
                                assertion="made_by"))
    return out


def object_heads(lead: str, field_: str) -> list[Mention]:
    """First noun of a title (after quantifiers), plus 'noun de/à noun' compounds."""
    s = _LOT_PREFIX.sub("", lead)
    offset = len(lead) - len(s)
    toks = tokens(s)
    i = 0
    while i < len(toks) and (toks[i].norm in lx.FR_QUANTIFIERS or toks[i].norm.isdigit()):
        i += 1
    if i >= len(toks):
        return []
    head = toks[i]
    hn = head.norm
    if len(hn) < 3 or hn in lx.NON_OBJECT_HEADS or hn in lx.FR_STOPWORDS or hn in lx.REGIONS:
        return []
    following = s[head.end:head.end + 8].split()
    nxt = following[0].strip(",.") if following else ""
    if nxt.isupper() and roman_to_int(nxt):
        return []  # "Louis XV, écu d'or…" — a ruler's name, not an object
    surface = s[head.start:head.end]
    out = [Mention("object_head", "object_type", "fr", field_, capitalize_first(surface.lower()), lemma(hn),
                   offset + head.start, offset + head.end, _quote(lead, offset + head.start, offset + head.end))]
    if (i + 2 < len(toks) and toks[i + 1].norm in ("de", "d", "a", "au", "aux")
            and toks[i + 2].norm not in lx.FR_STOPWORDS and toks[i + 2].norm not in lx.FR_QUANTIFIERS
            and len(toks[i + 2].norm) >= 3 and not toks[i + 2].norm.isdigit()):
        comp_surface = s[head.start:toks[i + 2].end]
        out.append(Mention("object_compound", "object_type", "fr", field_, capitalize_first(comp_surface.lower()),
                           lemma(f"{hn} {toks[i + 1].norm} {toks[i + 2].norm}"), offset + head.start,
                           offset + toks[i + 2].end, _quote(lead, offset + head.start, offset + toks[i + 2].end),
                           parent_key=lemma(hn)))
    return out


def _material_phrase(raw: str) -> str | None:
    words = [w.strip(_EDGE_PUNCT) for w in raw.split()]
    words = [w for w in words if w]
    if not words:
        return None
    first = (normalize_term(words[0]).split() or [""])[0]
    if first in ("l", "d"):  # "en l'état", "en l'absence"
        return None
    if (first in lx.NON_MATERIALS or first in lx.FR_STOPWORDS or first in lx.FR_QUANTIFIERS
            or (len(first) < 3 and first != "or")):
        return None
    kept = [words[0]]
    rest = words[1:]
    if first in lx.MATERIAL_COMPOUND_HEADS and len(rest) >= 2 and normalize_term(rest[0]) in ("de", "d"):
        kept += rest[:2]
        rest = rest[2:]
    for w in rest[:2]:
        if normalize_term(w) in lx.MATERIAL_MODIFIERS:
            kept.append(w)
        else:
            break
    return " ".join(kept)


def extract_materials(text_: str, field_: str) -> list[Mention]:
    out: list[Mention] = []
    for extractor, rx in (("material_trigger", _MATERIAL_TRIGGER), ("material_en", _MATERIAL_EN)):
        for m in rx.finditer(text_):
            phrase = _material_phrase(m.group("x"))
            if phrase:
                out.append(_mention(extractor, "material", field_, text_, m.start("x"),
                                    m.start("x") + len(phrase), capitalize_first(phrase.lower())))
    return out


def extract_lexicon_terms(text_: str, field_: str) -> list[Mention]:
    out: list[Mention] = []
    for tok in tokens(text_):
        if tok.norm in lx.TECHNIQUES:
            fr, en = lx.TECHNIQUES[tok.norm]
            out.append(_mention("technique_lexicon", "technique", field_, text_, tok.start, tok.end, fr, label_en=en))
        elif tok.norm in lx.REGIONS:
            fr, en = lx.REGIONS[tok.norm]
            out.append(_mention("region_lexicon", "region", field_, text_, tok.start, tok.end, fr, label_en=en))
    return out


# --------------------------------------------------------------------------------------
# One lot
# --------------------------------------------------------------------------------------


def _language_ok(text_: str, language: str) -> bool:
    return detect_language(text_) in (language, "unknown")


def extract_lot(lot: SourceLot, gazetteer: Gazetteer, fingerprint: str = "") -> LotExtraction:
    fields: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    for lang in ("fr", "en"):
        title = clean(lot.title.get(lang))
        desc = strip_title_prefix(clean(lot.description.get(lang)), title)
        for name, value in ((f"title_{lang}", title), (f"description_{lang}", desc)):
            if not value:
                continue
            if _language_ok(value, lang):
                fields[name] = (lang, value)
            else:
                skipped.append(name)

    mentions: list[Mention] = []
    for name, (lang, value) in fields.items():
        toks = tokens(value)
        for entries, a, b in gazetteer.find(lang, toks):
            start, end = toks[a].start, toks[b - 1].end
            shared = len({e.concept_key for e in entries}) > 1
            for e in {e.concept_key: e for e in entries}.values():
                mentions.append(Mention("gazetteer", e.dimension, lang, name, value[start:end],
                                        e.concept_key, start, end, _quote(value, start, end),
                                        concept_key=e.concept_key, ambiguous=e.ambiguous or shared))

    title_fr = fields.get("title_fr", ("fr", ""))[1]
    desc_fr = fields.get("description_fr", ("fr", ""))[1]
    header = maker_header(title_fr) if title_fr else None
    header = header or (brand_header(title_fr, gazetteer) if title_fr else None)
    if header:
        mentions.append(header)
    lead_field, lead = ("description_fr", desc_fr[:200]) if header else ("title_fr", title_fr)
    if lead:
        # A head noun already covered by a known term ("Boucles" in "Boucles d'oreilles") is not new.
        known = [(m.start, m.end) for m in mentions if m.extractor == "gazetteer" and m.field == lead_field]
        mentions += [h for h in object_heads(lead, lead_field)
                     if not any(a <= h.start < b for a, b in known)]
    for name in ("title_fr", "description_fr"):
        if name in fields:
            value = fields[name][1]
            mentions += extract_periods_styles(value, name)
            mentions += extract_makers(value, name)
            mentions += extract_materials(value, name)
            mentions += extract_lexicon_terms(value, name)

    # One mention per (extractor, dimension, key, concept) per lot is enough for counting.
    seen: set[tuple[str, str, str, str | None]] = set()
    unique: list[Mention] = []
    for m in mentions:
        k = (m.extractor, m.dimension, m.key, m.concept_key)
        if k not in seen:
            seen.add(k)
            unique.append(m)

    en_title = [lemma_token(t.norm) for t in tokens(fields.get("title_en", ("en", ""))[1])]
    en_desc = [lemma_token(t.norm) for t in tokens(fields.get("description_en", ("en", ""))[1])]
    # Brand-only titles ("GUCCI") carry no object name: the lead is then the start of the description.
    en_lead = (en_title + en_desc)[:EN_LEAD_TOKENS] if len(en_title) > 3 or not header else en_desc[:EN_LEAD_TOKENS]
    return LotExtraction(lot.lot_id, lot.source, lot.source_lot_id, lot.auction_key, lot.category.get("fr"),
                         lot.category.get("en"), lot.content_hash(), fingerprint, unique,
                         " ".join(en_title + en_desc), skipped, " ".join(en_lead))


# --------------------------------------------------------------------------------------
# Batch job with cache and resume
# --------------------------------------------------------------------------------------


@dataclass
class ExtractionStats:
    started_at: str
    finished_at: str = ""
    extractor_version: str = EXTRACTOR_VERSION
    gazetteer_terms: int = 0
    lots_total_in_source: int = 0
    lots_processed: int = 0
    resumed_from_lot_id: int = 0
    cache_hits: int = 0
    duplicate_content_reused: int = 0
    extracted: int = 0
    skipped_fields: dict[str, int] = field(default_factory=dict)
    mentions_by_extractor: dict[str, int] = field(default_factory=dict)
    seconds: float = 0.0
    ai_tokens_used: int = 0  # rules only
    output: str = ""


def _load(path: Path, fingerprint: str) -> dict[int, LotExtraction]:
    records: dict[int, LotExtraction] = {}
    if path.exists():
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    rec = LotExtraction.from_json(line)
                    if rec.fingerprint == fingerprint:
                        records[rec.lot_id] = rec
    return records


def run_extraction(engine: Engine, structure: StructureReport, gazetteer: Gazetteer, cache_dir: Path,
                   limit: int | None = None, batch_size: int = 500, resume: bool = False,
                   refresh: bool = False) -> ExtractionStats:
    """Extract all (or ``limit``) lots into ``cache_dir/lots.jsonl``; see module docstring."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    final, partial, state_path = cache_dir / "lots.jsonl", cache_dir / "lots.jsonl.partial", cache_dir / "state.json"
    fingerprint = f"{EXTRACTOR_VERSION}:{gazetteer.fingerprint}"
    stats = ExtractionStats(started_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                            gazetteer_terms=len(gazetteer.entries))
    t0 = time.perf_counter()
    previous = {} if refresh else _load(final, fingerprint)
    done: dict[int, LotExtraction] = _load(partial, fingerprint) if resume else {}
    after_id = max(done) if done else 0
    stats.resumed_from_lot_id = after_id
    by_content = {r.content_hash: r for r in (*previous.values(), *done.values())}
    skipped: Counter[str] = Counter()
    per_extractor: Counter[str] = Counter()
    for rec in done.values():
        skipped.update(rec.skipped_fields)
        per_extractor.update(m.extractor for m in rec.mentions)

    source = LotSource(structure)
    remaining = None if limit is None else max(0, limit - len(done))
    with engine.connect() as conn, partial.open("a" if resume else "w", encoding="utf-8") as out:
        stats.lots_total_in_source = source.count(conn)
        for batch in source.iter_batches(conn, after_id=after_id, batch_size=batch_size, limit=remaining):
            for lot in batch:
                h = lot.content_hash()
                prev = previous.get(lot.lot_id)
                if prev is not None and prev.content_hash == h:
                    rec = prev
                    stats.cache_hits += 1
                elif h in by_content:
                    same = by_content[h]
                    rec = LotExtraction(lot.lot_id, lot.source, lot.source_lot_id, lot.auction_key,
                                        lot.category.get("fr"), lot.category.get("en"), h, fingerprint,
                                        same.mentions, same.en_tokens, same.skipped_fields)
                    stats.duplicate_content_reused += 1
                else:
                    rec = extract_lot(lot, gazetteer, fingerprint)
                    stats.extracted += 1
                by_content.setdefault(h, rec)
                skipped.update(rec.skipped_fields)
                per_extractor.update(m.extractor for m in rec.mentions)
                out.write(rec.to_json() + "\n")
                done[lot.lot_id] = rec
            out.flush()
            state_path.write_text(json.dumps({"fingerprint": fingerprint, "last_lot_id": batch[-1].lot_id,
                                              "lots_done": len(done), "status": "running"}), encoding="utf-8")
            log.info("batch extracted", extra={"last_lot_id": batch[-1].lot_id, "lots_done": len(done)})
    os.replace(partial, final)
    stats.lots_processed = len(done)
    stats.skipped_fields = dict(skipped)
    stats.mentions_by_extractor = dict(per_extractor.most_common())
    stats.seconds = round(time.perf_counter() - t0, 2)
    stats.finished_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    stats.output = str(final)
    state_path.write_text(json.dumps({"fingerprint": fingerprint, "lots_done": len(done), "status": "completed",
                                      "stats": asdict(stats)}, ensure_ascii=False), encoding="utf-8")
    return stats


def load_extractions(cache_dir: Path) -> list[LotExtraction]:
    path = cache_dir / "lots.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; run extract-terms first")
    with path.open(encoding="utf-8") as fh:
        return [LotExtraction.from_json(line) for line in fh if line.strip()]


def load_stats(cache_dir: Path) -> dict[str, Any]:
    path = cache_dir / "state.json"
    return json.loads(path.read_text(encoding="utf-8")).get("stats", {}) if path.exists() else {}
