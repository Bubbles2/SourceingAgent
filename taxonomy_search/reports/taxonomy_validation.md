# Taxonomy validation report

- Generated: 2026-11-07T18:34:04+00:00
- Seed: `data/taxonomy/example_taxonomy.yaml` (version 0.1.0)
- Result: **0 error(s), 0 failed scenario(s)**

## 1. Seed contents

| Measure | Value |
|---|---|
| Concepts | 176 |
|   category | 11 |
|   subcategory | 61 |
|   object_type | 54 |
|   period | 10 |
|   style | 9 |
|   region | 6 |
|   material | 15 |
|   technique | 5 |
|   maker | 5 |
| Terms | 512 |
|   by language | fr: 244, en: 268 |
|   by type | preferred: 352, synonym: 150, spelling_variant: 7, abbreviation: 3 |
|   flagged ambiguous | 17 |
| Relationships | 186 |
|   broader | 140 |
|   originated_in_period | 5 |
|   revival_of | 3 |
|   associated_technique | 6 |
|   associated_material | 8 |
|   named_after | 1 |
|   active_in_period | 1 |
|   characteristic_object | 12 |
|   associated_region | 9 |
|   related | 1 |
| Drouot source categories mapped | 105 (113 mappings) |

## 2. Offline validation of the seed file

0 error(s), 0 warning(s), 3 note(s).

- **info**: term 'boulle' (en) labels several concepts: maker.andre_charles_boulle, technique.boulle_marquetry
- **info**: term 'silver' (en) labels several concepts: decorative_arts.silver, material.silver
- **info**: term 'boulle' (fr) labels several concepts: maker.andre_charles_boulle, technique.boulle_marquetry

## 3. Database sandbox

Migration `0001` was applied to a temporary schema `auction_search_sandbox` inside one transaction, the seed was loaded, the scenarios below were run, and the transaction was **rolled back**. Sandbox schema still present afterwards: **no**. `auction_search` and `drouot_collector` were not modified.

| Loaded | Inserted | Updated on a second load (idempotence) |
|---|---|---|
| concepts | 176 | 176 |
| terms | 512 | 512 |
| relationships | 186 | 186 |
| source_category_mappings | 113 | 113 |

Database checks (cycles, missing FR/EN labels): 0 issue(s).

## 4. Scenarios

- Example lot (style): `drouot_collector.lots.id = 7059` (drouot/35448881) — «Paire de vases en marbre brèche rose et monture en bronzé doré par Susse Frères, style Louis XIV de la seconde partie du XIXe siècle»
- Example lot (period): `drouot_collector.lots.id = 6928` (drouot/35448750) — «Rare et importante commode en bois noirci, placage d'écaille rouge, laiton et étain par Nicolas Sageot d'époque Louis XIV»

### Synonyms and translations

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | Translation = preferred labels of ONE concept in two languages | fr 'Bottines' → ['fashion.footwear.ankle_boots']; en 'Ankle boots' → ['fashion.footwear.ankle_boots'] |
| ✅ passed | Synonym = another label of the same concept, same language | 'Louis Quatorze style' → [('style.louis_xiv', 'synonym')] |
| ✅ passed | Spelling variant kept apart from synonyms | 'Buhl work' → [('technique.boulle_marquetry', 'spelling_variant')] |
| ✅ passed | Case and accents are normalised ('HERMES' finds 'Hermès') | 'HERMES' → ['Hermès'] |
| ✅ passed | False friends resolved by language (fr chandelier = candlestick) | fr 'chandeliers' → ['decorative_arts.lighting.candlesticks']; en 'chandeliers' → ['decorative_arts.lighting.ceiling_lights'] |

### Parent-child hierarchy

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | Footwear expands to its 7 subtypes (transitively) | narrower(fashion.footwear) = ['fashion.footwear.ankle_boots', 'fashion.footwear.boots', 'fashion.footwear.high_heels', 'fashion.footwear.loafers', 'fashion.footwear.pumps', 'fashion.footwear.sandals', 'fashion.footwear.sneakers'] |
| ✅ passed | Ankle boots → boots → footwear → fashion | ancestors = ['fashion.footwear.boots', 'fashion.footwear', 'fashion'] |
| ✅ passed | 18th century contains Régence/Louis XV/Louis XVI, not Louis XIV (1643–1715 spans two) | narrower(18th century) = ['period.louis_xv', 'period.louis_xvi', 'period.regence'] |

### Historical associations are not synonyms

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | Louis XIV period and Louis XIV style are separate concepts | period.louis_xiv (1643–1715, dimension period) vs style.louis_xiv (dimension style); shared labels: none |
| ✅ passed | Style→period link is 'originated_in_period' only (no hierarchy, no synonymy) | links: ['originated_in_period']; hierarchy path: False |
| ✅ passed | Boulle marquetry: associated technique of the style, named after A.-C. Boulle | with style.louis_xiv: ['associated_technique']; with maker: ['associated_technique', 'named_after'] |
| ✅ passed | Bare 'Boulle' is flagged ambiguous (technique or maker) | 'Boulle' (fr) → [('maker.andre_charles_boulle', 'ambiguous'), ('technique.boulle_marquetry', 'ambiguous')] |
| ✅ passed | Later Louis XIV-style work: Napoleon III style is a revival_of Louis XIV style | style.napoleon_iii ↔ style.louis_xiv: ['revival_of'] |

### Real lots: period vs style

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | Assertions recorded for two real lots | lot 7059 «Paire de vases en marbre brèche rose et monture en bronzé doré par Sus…» → in_style_of style.louis_xiv + dated_to period.19th_century; lot 6928 «Rare et importante commode en bois noirci, placage d'écaille rouge, la…» → dated_to period.louis_xiv + classified_as commodes |
| ✅ passed | 'Made in Louis XIV period' and 'in Louis XIV style' return different lots | dated_to Louis XIV period → [6928]; in_style_of Louis XIV → [7059] |
| ✅ passed | A style concept cannot be used as a dating ('dated_to' style.louis_xiv) | rejected by fk_lot_concepts_assertion_concept_dimension_lot_assertion_rules |

### Database constraints reject invalid data

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | 'broader' from a style to a period (not an allowed rule) | rejected by fk_taxonomy_relationships_relationship_type_source_dime_eea6 |
| ✅ passed | Relationship row lying about a concept's dimension | rejected by fk_taxonomy_relationships_source_concept_id_source_dime_50a0 |
| ✅ passed | A concept related to itself | rejected by ck_taxonomy_relationships_not_self |
| ✅ passed | Symmetric 'related' stored in non-canonical order | rejected by ck_taxonomy_relationships_related_canonical_order |
| ✅ passed | Duplicate concept key | rejected by uq_taxonomy_concepts_concept_key |
| ✅ passed | Second preferred label in the same language | rejected by uq_taxonomy_terms_one_preferred |
| ✅ passed | Another object type reusing the preferred label 'Boots' | rejected by uq_taxonomy_terms_preferred_label |
| ✅ passed | Evidence pointing at two things at once | rejected by ck_taxonomy_evidence_exactly_one_target |
| ✅ passed | Confidence outside 0–1 | rejected by ck_taxonomy_concepts_confidence_range |

### Versions and publication

| Result | Scenario | Evidence |
|---|---|---|
| ✅ passed | Nothing is visible to search while the version is a draft | while draft: {'published_concepts': 0, 'published_terms': 0, 'published_relationships': 0} |
| ✅ passed | After approval and publication the views expose the version | after approve + publish: {'published_concepts': 176, 'published_terms': 512, 'published_relationships': 186} |
| ✅ passed | Two published versions at once | rejected by uq_taxonomy_versions_one_published |

## 5. Sandbox database after loading

| Measure | Value |
|---|---|
| Versions | 0.1.0 (published) |
| Concepts by dimension | category: 11, maker: 5, material: 15, object_type: 54, period: 10, region: 6, style: 9, subcategory: 61, technique: 5 |
| Terms by language | en: 268, fr: 244 |
| Relationships by type | active_in_period: 1, associated_material: 8, associated_region: 9, associated_technique: 6, broader: 140, characteristic_object: 12, named_after: 1, originated_in_period: 5, related: 1, revival_of: 3 |
| Source category mappings | 113 |
| Published views (end of run) | published_concepts: 176, published_terms: 512, published_relationships: 186 |

