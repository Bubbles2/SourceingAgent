# Lot classification quality (Phase 4, rules only)

- Last run: 2026-11-08T18:18:15+00:00; classifier 4.3; taxonomy scope **draft** — the taxonomy is not reviewed yet, so every classification is provisional
- This run: 20,923 lots seen, 6,308 classified, 0 unchanged and skipped, 26,082 assertions written, 3.8 s, AI tokens 0
- In the database: **20,923 lots classified**, 3,220 flagged for review (15.4%)

## Assertions by dimension

| Dimension / assertion | Rows |
|---|---|
| subcategory / classified_as | 16944 |
| object_type / classified_as | 12816 |
| material / made_of | 11797 |
| region / originates_from | 4986 |
| period / dated_to | 2609 |
| subcategory / mentions | 2211 |
| object_type / mentions | 1763 |
| technique / uses_technique | 1460 |
| material / mentions | 814 |
| category / mentions | 601 |
| region / mentions | 600 |
| style / in_style_of | 468 |
| category / classified_as | 353 |
| period / mentions | 179 |
| maker / made_by | 175 |
| technique / mentions | 37 |
| style / mentions | 29 |
| maker / mentions | 2 |

## Quality checks

- Lots whose **text** names an object type: 6,918 (33.1%); the rest rely on the Drouot category only.
- Where the title (else the opening lines) names an object and the Drouot category is not a culture department (6,232 lots), they agree on the top-level category in **3,604** (57.8%). Disagreements are flagged ('Drouot category and text disagree') — they are either false positives in the text or miscategorised lots (e.g. spurs in *Chaussures*).
- Uncertain attributions (maker assertions short of 'made by'): none

Reasons for review:

| Reason | Lots |
|---|---|
| Drouot category and text disagree | 1710 |
| ambiguous term only | 1475 |
| conflicting dating | 30 |
| no object classification | 13 |

## Validation targets

- Louis XIV: `dated_to period.louis_xiv` → lots [3672, 6928, 6933, 6934]; `in_style_of style.louis_xiv` → lots [6442, 7059, 11346, 11417, 11829, 17758, 18024].
- Footwear `classified_as` lots: `fashion.footwear` 26, `fashion.footwear.ankle_boots` 1, `fashion.footwear.boots` 4, `fashion.footwear.high_heels` 0, `fashion.footwear.loafers` 1, `fashion.footwear.pumps` 1, `fashion.footwear.sandals` 4, `fashion.footwear.sneakers` 3

## Representative sample (deterministic) for manual inspection

| Lot | Review | Assertions (concept, assertion, confidence, position) |
|---|---|---|
| 5329 |  | fine_art.paintings.modern classified_as 0.950 [category] |
| 1970 |  | world_arts.asian_art classified_as 0.950 [category]; region.asia originates_from 0.950 [category]; region.china originates_from 0.900 [title] |
| 20074 |  | fine_art.paintings.modern classified_as 0.950 [category]; fine_art.paintings classified_as 0.900 [title]; material.wood made_of 0.800 [lead]; material.glass made_of 0.800 [lead]; decorative_arts.frames mentions 0.400 [note] |
| 18829 |  | jewellery_watches.jewellery.rings classified_as 0.950 [category] |
| 9700 |  | fine_art.prints.lithographs classified_as 0.950 [category]; technique.lithography uses_technique 0.950 [category] |
| 4612 |  | furniture.case_furniture.commodes classified_as 0.950 [category]; furniture.tables classified_as 0.900 [title]; decorative_arts.lighting.wall_lights classified_as 0.800 [lead]; material.wood made_of 0.800 [lead]; material.brass made_of 0.800 [lead]; material.glass made_of 0.800 [lead] |
| 6095 |  | jewellery_watches.jewellery.rings classified_as 0.950 [category] |
| 11610 |  | fine_art.prints.lithographs classified_as 0.950 [category]; technique.lithography uses_technique 0.950 [category]; fine_art mentions 0.400 [note]; fine_art.paintings mentions 0.400 [note] |
| 16774 |  | jewellery_watches.gemstones.semi_precious classified_as 0.950 [category] |
| 4897 |  | decorative_arts.lighting.wall_lights classified_as 0.950 [category]; material.brass made_of 0.800 [lead] |
| 12977 |  | decorative_arts.tableware.plates_dishes classified_as 0.950 [category]; furniture.tables classified_as 0.900 [title]; decorative_arts.frames classified_as 0.900 [title]; period.19th_century dated_to 0.900 [title]; material.gold made_of 0.900 [title]; material.glass made_of 0.900 [title] |
| 21461 |  | fine_art.sculpture.plaster classified_as 0.950 [category]; material.plaster made_of 0.950 [category]; fine_art.sculpture classified_as 0.800 [lead]; decorative_arts.frames classified_as 0.800 [lead]; material.metal made_of 0.800 [lead] |
| 10013 |  | fine_art.prints.lithographs classified_as 0.950 [category]; technique.lithography uses_technique 0.950 [category]; fine_art.prints classified_as 0.900 [title] |
| 17684 |  | collectibles.natural_history classified_as 0.950 [category] |
| 20435 |  | jewellery_watches.gemstones.precious classified_as 0.950 [category] |
| 18363 |  | world_arts.asian_art classified_as 0.950 [category]; region.asia originates_from 0.950 [category] |
| 11205 |  | fine_art.paintings.modern classified_as 0.950 [category]; material.wood made_of 0.800 [lead]; fine_art mentions 0.400 [note]; decorative_arts.frames mentions 0.400 [note]; region.france mentions 0.400 [note]; region.italy mentions 0.400 [note] |
| 17591 |  | fine_art.prints.lithographs classified_as 0.950 [category]; technique.lithography uses_technique 0.950 [category]; fine_art.prints classified_as 0.800 [lead] |
| 17793 |  | furniture.screens classified_as 0.950 [category]; period.19th_century dated_to 0.900 [title]; material.wood made_of 0.900 [title] |
| 12880 | ambiguous term only: fine_art.sculpture.marble | material.brass made_of 0.900 [title]; material.marble made_of 0.900 [title]; furniture.tables.consoles classified_as 0.855 [category] |
| 17382 |  | decorative_arts.tableware.table_services classified_as 0.950 [category] |
| 9491 |  | books_manuscripts.comics classified_as 0.950 [category] |
| 8206 |  | fine_art.photography classified_as 0.950 [category]; period.19th_century dated_to 0.900 [title] |
| 8878 |  | fine_art.paintings.modern classified_as 0.950 [category]; fine_art.paintings classified_as 0.900 [title] |
| 8006 |  | fine_art.photography classified_as 0.950 [category] |

