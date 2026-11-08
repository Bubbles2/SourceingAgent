# Taxonomy

**Status (2026-11-08):** schema applied; the example seed (§6) is loaded as draft version `0.1.0`,
952 rule-extracted candidates (§8) as draft version `0.2.0`, and 24 relationship proposals from
search feedback (§10) as draft version `0.3.0`. Every row is `candidate` (awaiting review), so
nothing is published. Until a version is published, classification and search use the **draft
scope** (§7.1). Review and publication: §7.

## 1. Model in one page

```
                 taxonomy_versions (draft → published → retired; one published at a time)
                          │ introduced_in / retired_in
                          ▼
taxonomy_dimensions ◄── taxonomy_concepts ───────────────┐
 (9 dimensions)          key, dimension, years, notes     │
                          ▲          ▲                    │
                          │          │ (id, dimension)    │ (id, dimension)
          taxonomy_terms ─┘   taxonomy_relationships ─────┘     taxonomy_relationship_rules
          language, term,     type, source, target  ──────────► (type, source dim, target dim)
          normalized, type,
          ambiguous
                                     lot_concepts ──► lot_assertion_rules (assertion, dimension)
source_category_mappings ──► (Drouot category → concept + assertion)
taxonomy_evidence ──► one of concept / term / relationship, + source lot and quote
```

A **concept** is a meaning; **terms** are the words for it; **relationships** are typed links
between meanings. This is the SKOS pattern, extended with dimensions and rules.

| Requirement | How it is represented |
|---|---|
| Synonyms | Several terms of one concept in the same language (`term_type = synonym`) |
| Translations | Preferred labels of one concept in different languages ("Bottines" fr / "Ankle boots" en) |
| Spelling variants, abbreviations | Their own term types (`spelling_variant`: "Buhl"; `abbreviation`: "BD") |
| Parent–child | `broader` relationship (child → parent), transitive; allowed only inside compatible dimensions |
| Historical associations | Typed, directed relationships (`originated_in_period`, `revival_of`, `associated_technique`, `named_after`, `active_in_period`, …) — never `broader`, never shared terms |
| Period vs style | Separate dimensions. A lot is `dated_to` a **period** or `in_style_of` a **style**; the database rejects `dated_to` with a style concept |
| Confidence, evidence, provenance | `confidence` 0–1, `provenance`, `review_status` on every row; `taxonomy_evidence` links rows to source lots and quotes |
| Versions | `introduced_in_version_id` / `retired_in_version_id`; `published_*` views show only approved rows of the published version |

## 2. Dimensions

| Dimension | Meaning | Examples |
|---|---|---|
| `category` | Auction department | Furniture, Fine art, Fashion, Jewellery and watches, Collectibles, + World arts, Books and manuscripts, Coins and medals, Wine and spirits, Arms and militaria (found in the Drouot data) |
| `subcategory` | Grouping inside a category | Footwear, Seating, Old Master paintings |
| `object_type` | What the object is | Ankle boots, Commodes, Bergères |
| `period` | When it was made; carries years | Louis XIV period (1643–1715), 18th century |
| `style` | Stylistic idiom, may be later than its period | Louis XIV style, French Baroque, Napoleon III style |
| `region` | Place or culture of origin | France, China |
| `material` | What it is made of | Gilt bronze, Tortoiseshell |
| `technique` | How it was made or decorated | Boulle marquetry, Lithography |
| `maker` | Artist, craftsman, workshop or brand (`attributes.kind`) | André-Charles Boulle, Hermès |

Labels for categories, subcategories and object types are plural (Drouot and Getty AAT
practice). Singular/plural forms are matched by the extractor (Phase 3: a crude singular form is
applied to both the text and the terms).

## 3. Relationship types and rules

| Type | Direction | Allowed dimensions (source → target) | Expansion weight |
|---|---|---|---|
| `broader` | child → parent, transitive | category→category; subcategory→category/subcategory; object_type→category/subcategory/object_type; and same-dimension for period, style, region, material, technique, maker | 1.0 |
| `related` | symmetric (stored once, lower id first) | any → any | 0.4 |
| `originated_in_period` | style → period | style → period | 0.7 |
| `revival_of` | later style → earlier style | style → style | 0.5 |
| `associated_technique` | → technique | style, period, region, maker, material, category, subcategory, object_type → technique | 0.5 |
| `associated_material` | → material | style, period, region, maker, technique, category, subcategory, object_type → material | 0.4 |
| `named_after` | → maker | technique, style, material, category, subcategory, object_type → maker | 0.5 |
| `active_in_period` | maker → period | maker → period | 0.5 |
| `associated_region` | → region | style, period, maker, technique, material, category, subcategory, object_type → region | 0.3 |
| `characteristic_object` | → object classification | style, period, region, maker, technique, material → category/subcategory/object_type | 0.5 |

The weights are defaults for query expansion (Phase 7). The allowed triples are stored in
`taxonomy_relationship_rules` and enforced by a foreign key, so for example
`style.louis_xiv —broader→ period.louis_xiv` is rejected by PostgreSQL.

## 4. Lot assertions (`lot_concepts`, filled by `classify-lots`)

| Assertion | Concept dimension | French catalogue wording |
|---|---|---|
| `classified_as` | category, subcategory, object_type | — |
| `dated_to` | period | "d'époque Louis XIV", "XVIIIe siècle" |
| `in_style_of` | style | "de style Louis XIV", "dans le goût de" |
| `made_by` / `attributed_to` / `workshop_of` / `circle_of` / `follower_of` / `after` | maker | signé / attribué à / atelier de / entourage de / suiveur de / d'après |
| `made_of` | material | "en bronze doré" |
| `uses_technique` | technique | "marqueterie Boulle" |
| `originates_from` | region | "travail français" |
| `mentions` | any | weak link, nothing asserted |

Example (verified in the sandbox with real lots):

- lot 7059 «Paire de vases … style Louis XIV de la seconde partie du XIXe siècle» →
  `in_style_of style.louis_xiv` + `dated_to period.19th_century`
- lot 6928 «Rare et importante commode … d'époque Louis XIV» → `dated_to period.louis_xiv` +
  `classified_as furniture.case_furniture.commodes`

A search for furniture *made in* the Louis XIV period returns 6928 only; a search for the Louis XIV
*style* returns 7059 only. A broad search can combine both through `originated_in_period`.

On all 20,923 lots (Phase 4, draft scope): `dated_to period.louis_xiv` → lots 3672, 6928, 6933,
6934; `in_style_of style.louis_xiv` → lots 6442, 7059, 11346, 11417, 11829, 17758, 18024 — no
overlap. 57,844 assertions in total; see `reports/classification_quality.md`.

## 5. Worked examples

**Footwear** (`fashion.footwear`, fr "Chaussures", en "Footwear"/"Shoes"):

```
fashion
└── fashion.footwear            Chaussures / Footwear
    ├── boots                   Bottes / Boots
    │   └── ankle_boots         Bottines / Ankle boots      (a kind of boot)
    ├── high_heels              Chaussures à talons / High heels
    ├── pumps                   Escarpins / Pumps, Court shoes  ──related── high_heels
    ├── loafers                 Mocassins / Loafers, Moccasins
    ├── sneakers                Baskets (ambiguous) / Sneakers, Trainers
    └── sandals                 Sandales / Sandals
```

"Escarpins" are linked to "High heels" by `related`, not `broader`, because not every
escarpin is high-heeled. "Baskets" is flagged ambiguous (it also means basketball).

**Louis XIV furniture:**

```
period.louis_xiv (1643–1715) ──broader──► period.ancien_regime
        ▲ originated_in_period            ▲ active_in_period
style.louis_xiv ──broader──► style.french_baroque ──broader──► style.baroque
        │ associated_technique                    maker.andre_charles_boulle (1642–1732)
        ▼                                                ▲ named_after
technique.boulle_marquetry ──broader──► technique.marquetry
        │ associated_material: tortoiseshell, brass
        │ characteristic_object: commodes, cabinets, bureaux plats, mantel clocks
style.napoleon_iii ──revival_of──► style.louis_xiv   (later furniture in Louis XIV style)
```

Furniture object types (commodes, cabinets, bureaux plats, armchairs, bergères…) are separate
`object_type` concepts; a lot combines them with period/style/technique through assertions.

**False friends:** fr "chandelier" = en "candlestick"; en "chandelier" = fr "lustre". They are
labels of two different concepts in two languages, so matching by language resolves them.

## 6. The example seed (`data/taxonomy/example_taxonomy.yaml`)

Hand-authored by Claude in Phase 2 and **not yet reviewed by a domain expert**.
It loads with `review_status = candidate` unless `load-taxonomy --approve` is used.

| Content | Count |
|---|---|
| Concepts | 176 (11 categories, 61 subcategories, 54 object types, 10 periods, 9 styles, 6 regions, 15 materials, 5 techniques, 5 makers) |
| Terms | 512 (fr 244, en 268; 352 preferred, 150 synonyms, 7 spelling variants, 3 abbreviations; 17 flagged ambiguous) |
| Relationships | 186 (140 broader, 46 typed associations) |
| Drouot categories mapped | all 105 found in Phase 1 (113 mappings: some also assert a material, technique or region, e.g. "Marbres" → marble sculptures + made of marble) |

Drouot label problems recorded in the seed: "Lampadaire" translated as "lampposts" (should be floor
lamps); "Chandeliers" used in the English label for candlesticks; "Histo medals".

### Seed file format

```yaml
version: "0.1.0"
concepts:
  - key: fashion.footwear.ankle_boots          # lower-case dotted, unique, stable
    dimension: object_type
    broader: [fashion.footwear.boots]           # creates 'broader' relationships
    labels: {fr: Bottines, en: Ankle boots}     # preferred labels, fr and en required
    synonyms: {en: [Booties]}                   # also spelling_variants, abbreviations, hidden
    years: [1643, 1715]                         # optional
    note: {en: "...", fr: "..."}                # optional scope notes
    attributes: {kind: brand}                   # optional
  # a term can be {text: Baskets, ambiguous: true}
relationships:
  - [style.louis_xiv, originated_in_period, period.louis_xiv]
source_categories:
  - {fr: Marbres, en: Marble sculptures, map: [fine_art.sculpture.marble, {made_of: material.marble}]}
```

## 7. Maintenance and review workflow

Hand-curated changes (seed YAML):

1. Edit the YAML.
2. `validate-taxonomy` (offline) — then `validate-taxonomy --sandbox` (rolled-back DB test).
3. `load-taxonomy --dry-run`, then `load-taxonomy`.

Loading is an idempotent upsert keyed on concept key / (concept, language, normalised term) /
(type, source, target). A changed preferred label keeps the old one as a synonym. Concepts removed
from the YAML are **not** deleted; retirement is a reviewed change (Phase 10).

Reviewing candidates (seed or extracted) and publishing:

1. `review-taxonomy export reviews.csv --version 0.2.0` — one row per candidate, sorted by
   confidence, with French/English labels, proposed parent, number of lots and auctions, an example quote.
2. In the `decision` column write `approve` or `reject`; correct `label_fr` / `label_en` if needed
   (an approved concept must have both). Leave a row blank to decide later.
3. `review-taxonomy apply reviews.csv --dry-run`, then without `--dry-run`. Single concepts:
   `review-taxonomy approve KEY …` / `reject KEY …`.
4. `publish-taxonomy 0.2.0 --dry-run`, then `publish-taxonomy 0.2.0`.
5. `maintain` — reclassifies the lots affected by the change, refreshes indexes and embeddings,
   and runs the regression check. After a publication the taxonomy fingerprint changes, so
   `classify-lots` reclassifies every lot with the published version.

### 7.1 Which taxonomy is used before anything is published (draft scope)

`TaxonomySnapshot` (`taxonomy/snapshot.py`) loads the taxonomy into memory for classification,
search, expansion and external validation. `--scope auto` (the default everywhere) uses the
published version if there is one, otherwise the **draft**:

- included: rows that are not rejected and not retired, **and** either hand-curated (provenance
  `seed`, `source_category`, `manual`) or approved;
- excluded: unreviewed machine-made candidates (provenance `rule_extraction`, `ai_extraction`,
  `search_feedback`) — Phase 4 showed that junk extracted object heads otherwise classify lots wrongly.

Every report, CLI output and API response states the scope used (`taxonomyScope`), and the CLI
warns when it is the draft. The draft therefore currently means the 176 seed concepts.

### Reviewer guide

Files (exported 2026-11-07): `reports/review_0.1.0_seed.csv` (176 seed concepts) and
`reports/review_0.2.0_candidates.csv` (952 extracted candidates, highest confidence first). They are
UTF-8 with a byte-order mark so accents display in Excel; for Excel with French regional settings
re-export with `--delimiter ";"`. `apply` accepts comma or semicolon files, UTF-8 or Windows-1252.

| Column | Meaning |
|---|---|
| `decision` | **The only column you must fill.** `approve` / `reject` (also accepted: yes/no, oui/non, approuvé/rejeté). Blank = decide later. |
| `label_fr`, `label_en` | Preferred labels. Edit them to correct; an approved concept needs both. |
| `broader` | Proposed parent. Not editable here: if wrong, approve the concept but reject or ignore the parent (or note it for a seed change). |
| `lots`, `auctions` | How many lots / auctions mention it (real count, not the 5 stored quotes). |
| `ambiguous_lots` | Seed concepts: lots matched **only** through an ambiguous word (e.g. "Or": 3,314 of 4,088 via French "or"). |
| `top_categories` | Drouot categories where it occurs — a quick sense check ("High heels" mostly in *Armes* = wrong sense). |
| `english_in_data` | Hint, not a translation: the English word most associated with these lots (candidates: how the label was obtained and its score). "Wood → chinese" only means wooden objects are often Chinese. |
| `example` | One quote from a real lot. |

What to look for: wrong English labels (e.g. "Or blanc" → "Carat" should be "White gold"); place
names or catalogue headings proposed as makers ("Vatican", "Ngc"); parents that follow Drouot
departments rather than "is a kind of" ("Pendentif" → necklaces); near-duplicates ("Époque Empire" /
"Époque Premier-Empire" — see §4 of the extraction report). Synonyms and the ambiguity flag of
individual terms cannot be changed through the CSV: note them, and they go into the seed YAML.

Rules: approving a concept approves its candidate labels and every candidate relationship whose two
ends are then approved; rejecting a concept rejects its labels and all its relationships. Approve
seed parents too (e.g. `fashion.footwear`), otherwise the `broader` links to them stay unapproved.
Publish **`0.2.0`** once both files are applied: the published views include approved rows of all
earlier versions, so `0.1.0` does not need publishing separately. Publishing
refuses while an approved concept lacks an approved FR or EN label, an approved relationship touches
an unapproved concept, or `broader` has a cycle. Only approved rows of the published version (and
earlier versions) appear in the `published_*` views that search will use. Nothing is ever deleted.

## 8. Building from lot data (Phase 3, rules only)

`build-taxonomy` = `extract-terms` → `build-candidates` → `import-candidates`. **No AI is used**
(decision of 2026-11-07); every step is deterministic and reproducible.

### 8.1 Extraction (`extract-terms`)

Lots are read in batches of 500 (keyset pagination). Each French/English field is cleaned (HTML
entities decoded, the title prefix removed from the description) and **skipped if its content is in
another language** (by the Phase 1 detector). Results are cached per lot in `.cache/extraction/`
keyed by a content hash + extractor version + taxonomy fingerprint; lots with identical text are
extracted once; an interrupted run continues with `--resume`.

| Rule | Finds | Dimension | Example from the data |
|---|---|---|---|
| gazetteer | known taxonomy terms (singular/plural tolerant, longest match) | any | "Bottines", "marqueterie Boulle" |
| period_epoque | "d'époque X" | period | Époque Restauration, Époque Qing |
| century | "XIXe siècle", "fin du XVIIIe s.", "époque 19ème" | period | XXe siècle → 20th century |
| style | "style X", "dans le goût de X" | style | Style Art Déco, Style néogothique |
| maker_header | "Prénom NOM (1806-1869)" / "NOM, Prénom (…)" at the start of a title (rulers excluded) | maker | Kilian Metzinger 1806–1869 |
| brand_header | an all-capitals first segment that is not a known object | maker | GUCCI, BACCARAT |
| maker_attribution | attribué à / atelier de / entourage de / suiveur de / d'après / manufacture de | maker (+ assertion) | Attribué à Bernard Molitor |
| maker_by | par / signé / estampillé + capitalised name | maker | par Nicolas Sageot |
| object_head | first noun of the title after quantifiers (or of the description when the title is a name/brand) | object_type | Bouteille, Pendentif |
| object_compound | "nom de/à nom" | object_type (parent = head noun) | Bouteille à tabac → Bouteille |
| material_en / material_trigger | "en X [doré/jaune…]", "placage de X", "monture en X" | material | Or jaune, Bois de rose |
| technique_lexicon / region_lexicon | small closed lists (`enrichment/lexicons.py`) | technique / region | Émaillage, Chine |

### 8.2 Candidates (`build-candidates`)

Mentions are grouped by (dimension, lemma). Groups seen in fewer than `--min-lots` lots (default 3)
are not proposed. A group whose label matches an existing concept of a compatible dimension becomes
**evidence for that concept** instead. Object heads that are really maker/brand names, labels that
belong to another dimension, and capitalised headings seen in one auction only are dropped.

* **English labels**: from the rule where it gives one (centuries, lexicons, "X period"/"X style"),
  otherwise by **alignment**: every lot has French and English text, so the English unigram/bigram
  whose lots best overlap the French term's lots (Dice coefficient ≥ 0.2, co-occurring in ≥ 2
  auctions) is proposed. Object types are aligned on the English title and first words only.
* **Parents**: a compound's head noun; else the Drouot category holding ≥ 50% of the term's lots
  (via `source_category_mappings`), except culture departments (Asian/Islamic art…), which say where
  an object is from, not what it is. "Style X" ↔ "Époque X" gives `originated_in_period`.
* **Confidence** = rule prior × support (`log2(1+lots)/log2(11)`, saturating at 10 lots) × 0.8 if all
  lots are from one auction × 0.9 if no English label.
* **Suggestions only** (not imported): possible spelling variants (near-identical labels) and
  synonyms (French terms aligned to the same English term).

### 8.3 Import (`import-candidates`)

Candidates with confidence ≥ 0.4 (`--min-confidence`) become concepts, preferred FR/EN labels and
relationships in draft version `0.2.0`, all `candidate` / `rule_extraction`, with up to 5 evidence
lots each in `taxonomy_evidence`. Evidence is also stored for the existing concepts the extraction
attested. Re-importing never touches reviewed rows and never duplicates evidence.

### 8.4 Result on 2026-11-07 (all 20,923 lots)

| Measure | Value |
|---|---|
| Run time | 16.5 s for the whole pipeline (extraction 10 s) |
| AI tokens | 0 |
| Candidates built | 1,760 (object types 835, materials 544, makers 252, styles 45, periods 41, regions 23, techniques 20) |
| Imported (confidence ≥ 0.4) | **952** concepts (object types 462, materials 228, makers 140, periods 40, styles 39, regions 23, techniques 20), 1,748 labels, 290 relationships (285 broader, 5 originated_in_period), 5,400 evidence rows |
| Without an English label | 156 of 952 (no convincing alignment, or the English term is already another concept's label) |
| Existing concepts attested | 163 of 176 seed concepts |

Details and the validation targets: [reports/taxonomy_extraction.md](../reports/taxonomy_extraction.md).
Review file: `reports/review_0.2.0_candidates.csv`.

## 9. Known limitations

- The seed (0.1.0), the extracted candidates (0.2.0) and the search-feedback proposals (0.3.0) are
  **unreviewed**; nothing is published. Classification and search run on the draft scope (§7.1).
- A *mention* is not a *classification*: lot 6928's English note mentions "stamp" (the maker's
  estampille) and A.-C. Boulle (as an influence). Phase 4 classifies by position (title, first
  sentences) and records notes only as `mentions`.
- Ambiguous words cause false attestations: "heels" (rifle stocks, 43 lots in *Arms*), "pumps"
  (bicycle/water pumps), French "bottes" ("bottes de blé" = sheaves). The seed flags the first two;
  "Bottes" should be flagged too (recommended review change, open question).
- Alignment sometimes proposes a related word instead of the translation ("Or blanc" → "Carat",
  "Métal doré" → "Tone metal"); the Dice score is stored for review.
- Parents proposed from Drouot categories reflect departments, not strict is-a ("Pendentif" →
  necklaces because Drouot sells pendants there).
- Normalisation is accent/case/punctuation folding plus a crude singular form; no full stemming.
- Cycle detection for `broader` runs in Python, not as a database constraint.
- `start_year`/`end_year` are integers; approximate dating ("vers 1700") is not modelled.
- Text and Drouot category disagree on the top-level category for 42% of the lots where the title
  (else the opening lines) names an object (1,710 lots flagged): partly real (a frame sold in Paintings), partly classifier
  errors — see `reports/classification_quality.md`.
- Co-occurrence proposals (§10) show association, not cause: "Napoléon III ↔ marquetry" is a real
  pattern of the market; whether it belongs in the taxonomy is a reviewer's decision.

## 10. Continuous improvement (Phase 10)

`improve-taxonomy` learns from the project's own data and **only proposes**: everything it writes
is a `candidate` row of a draft version (default `0.3.0`, provenance `search_feedback`), reviewed
with the §7 workflow. External provider results are never used.

| Source | What it proposes | Where it goes |
|---|---|---|
| `search_queries.unresolved_terms` (words searched but not understood) | phrases and words that match an unreviewed candidate get `attributes.search_demand` (number of searches) so reviewers see them first; others go to a suggestions file with the concepts of the lots that contain them | candidate concept attributes; `reports/search_feedback_suggestions.csv` |
| Concepts with a French label and no English one | English labels by French–English alignment over the bilingual lots (Dice ≥ 0.4) | candidate `preferred` terms |
| `lot_concepts` co-occurrence | style/period × technique/material pairs seen in ≥ 3 lots with lift ≥ 3 → `associated_technique` / `associated_material` | candidate relationships |
| Classification review reasons | counts of lots by review reason, and of assertions below 0.6 confidence (excluding `mentions`) | report only |
| `--extract` | runs the Phase 3 extraction on new or changed lots and imports new candidates | candidate concepts |

Result on 2026-11-08: 12 unresolved terms (from 20 replayed benchmark queries and two manual
searches — no real users yet); 4 candidates marked with search demand (`art deco` →
`period.art_deco`, `silk scarf` → `fashion.accessories.foulard`, `antique` → `style.antique`,
`monnaie` → `numismatics.coins_banknotes.monnaie`); 0 translations; 24 relationships proposed (e.g.
`style.louis_xvi` ↔ gilt bronze, lift 10.3; `style.napoleon_iii` ↔ marquetry, lift 39.4).
Report: `reports/taxonomy_improvement.md`.

The loop: searches are logged → `improve-taxonomy` proposes → a person reviews and publishes →
`maintain` reclassifies the affected lots, refreshes indexes and embeddings, and `run-regression`
checks that search quality did not drop and that the invariants hold.
