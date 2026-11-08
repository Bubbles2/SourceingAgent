# Taxonomy improvement (Phase 10)

- Draft version `0.3.0`; every proposal is a `candidate` for the review workflow; nothing is approved or published.
- Sources: the project's own search log, lots and classifications. External provider results are never used to change the taxonomy.

## Words searched but not understood

| Term | Searches |
|---|---|
| antique | 1 |
| vintage | 1 |
| designer | 1 |
| diamond | 1 |
| white | 1 |
| persan | 1 |
| russe | 1 |
| monnaie | 1 |
| art | 1 |
| deco | 1 |
| silk | 1 |
| scarf | 1 |

Matched an existing unreviewed candidate (marked `search_demand` so it is reviewed first): `art deco` → `period.art_deco`, `silk scarf` → `fashion.accessories.foulard`, `antique` → `style.antique`, `monnaie` → `numismatics.coins_banknotes.monnaie`

For a human to decide (`reports/search_feedback_suggestions.csv`): 

| Term | Searches | Lots containing it | Concepts of those lots |
|---|---|---|---|
| vintage | 1 | 170 | wine_spirits.wine 31%; material.gold 19%; region.france 14% |
| designer | 1 | 1526 | material.gold 41%; jewellery_watches.jewellery.rings 13%; material.porcelain 11% |
| diamond | 1 | 1545 | material.gold 82%; jewellery_watches.jewellery.rings 46%; jewellery_watches.jewellery.necklaces 19% |
| white | 1 | 2105 | material.gold 49%; jewellery_watches.jewellery.rings 23%; region.china 18% |
| persan | 1 | 57 | decorative_arts.carpets 82%; decorative_arts.textiles 75%; period.19th_century 14% |
| russe | 1 | 730 | fine_art.paintings.icons 79%; material.wood 78%; period.19th_century 49% |
| art | 1 | 1141 | region.france 13%; fine_art.paintings.old_masters 12%; material.glass 11% |
| deco | 1 | 174 | material.gold 25%; material.glass 24%; jewellery_watches.jewellery.rings 18% |
| silk | 1 | 370 | region.china 26%; region.asia 23%; world_arts.asian_art 23% |
| scarf | 1 | 25 | fashion.accessories 72%; maker.hermes 44%; fashion 8% |

## Proposed translations

_none_

## Proposed relationships (co-occurrence in classified lots)

| Source | Type | Target | Lots | Lift |
|---|---|---|---|---|
| style.rococo | associated_material | material.porcelain | 26 | 4.0 |
| style.louis_xvi | associated_material | material.marble | 22 | 9.3 |
| style.louis_xvi | associated_material | material.gilt_bronze | 19 | 10.3 |
| style.louis_xv | associated_material | material.gilt_bronze | 18 | 10.1 |
| style.louis_xv | associated_technique | technique.marquetry | 17 | 24.4 |
| period.napoleon_iii | associated_material | material.brass | 17 | 4.8 |
| style.louis_xv | associated_material | material.marble | 17 | 7.5 |
| style.louis_xvi | associated_technique | technique.marquetry | 12 | 16.5 |
| period.louis_xv | associated_material | material.wood | 11 | 3.5 |
| style.neoclassicism | associated_material | material.gilt_bronze | 11 | 9.3 |
| period.louis_xvi | associated_material | material.marble | 10 | 11.6 |
| period.napoleon_iii | associated_material | material.leather | 8 | 3.0 |
| period.louis_xvi | associated_material | material.brass | 8 | 3.6 |
| style.regence | associated_material | material.wood | 7 | 3.5 |
| style.rococo | associated_technique | technique.gilding | 7 | 3.2 |
| style.neoclassicism | associated_material | material.marble | 7 | 4.6 |
| style.napoleon_iii | associated_technique | technique.marquetry | 7 | 39.4 |
| style.napoleon_iii | associated_material | material.gilt_bronze | 6 | 13.2 |
| period.napoleon_iii | associated_material | material.gilt_bronze | 6 | 5.6 |
| style.napoleon_iii | associated_material | material.tortoiseshell | 4 | 20.9 |
| period.regence | associated_material | material.marble | 3 | 19.8 |
| period.napoleon_iii | associated_material | material.tortoiseshell | 3 | 6.7 |
| period.louis_xvi | associated_material | material.gilt_bronze | 3 | 4.5 |
| style.louis_xiv | associated_material | material.glass | 3 | 3.4 |

## Lots with low-confidence or uncertain classifications

| Reason | Count |
|---|---|
| Drouot category and text disagree | 1710 |
| ambiguous term only | 1475 |
| conflicting dating | 30 |
| no object classification | 13 |
| assertions below 0.6 confidence | 0 |

