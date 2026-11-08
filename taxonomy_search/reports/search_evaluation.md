# Search evaluation (Phase 9)

- 20 queries (French and English); taxonomy scope `draft` — the taxonomy is the unreviewed draft, so these are provisional results
- **Labels are provisional rules** (Drouot category + text patterns, written before running the systems), not human judgements. Human labels applied: 0. A pool of 600 results to judge is in `data/benchmark/judgements_to_review.csv`.
- Costs: 0 AI tokens and 0 external API calls for every system; embeddings are computed locally.

## Results (mean over queries)

| System | P@10 | R@50 | nDCG@10 | MRR | Queries with no result | Mean ms | p95 ms |
|---|---|---|---|---|---|---|---|
| `keyword_raw` | 0.535 | 0.453 | 0.574 | 0.6 | 7 | 2.1 | 11.7 |
| `keyword_content` | 0.525 | 0.432 | 0.582 | 0.71 | 4 | 1.2 | 3.6 |
| `semantic_only` | 0.445 | 0.345 | 0.463 | 0.642 | 0 | 22.1 | 123.1 |
| `taxonomy_only` | 0.6 | 0.693 | 0.678 | 0.76 | 0 | 15.2 | 128.6 |
| `hybrid_exact` | 0.725 | 0.662 | 0.819 | 0.925 | 0 | 21.1 | 68.3 |
| `hybrid_broad` | 0.795 | 0.828 | 0.88 | 0.967 | 0 | 33.8 | 61.7 |

Best nDCG@10: **hybrid_broad**. Hybrid (broad) vs keyword on content words: P@10 0.525 → 0.795, R@50 0.432 → 0.828, nDCG@10 0.582 → 0.88; latency 1.2 ms → 33.8 ms.

## Per query (P@10 / nDCG@10)

| Id | Query | Relevant lots | keyword_raw | keyword_content | semantic_only | taxonomy_only | hybrid_exact | hybrid_broad |
|---|---|---|---|---|---|---|---|---|
| q01 | Find auctions selling shoes | 21 | 0.0/0.00 | 0.8/0.86 | 0.0/0.00 | 1.0/1.00 | 0.9/0.94 | 0.9/0.86 |
| q02 | Find Louis XIV furniture | 4 | 0.0/0.00 | 0.0/0.00 | 0.0/0.00 | 0.4/1.00 | 0.4/1.00 | 0.4/1.00 |
| q03 | commode d'époque Louis XIV | 2 | 0.2/1.00 | 0.2/1.00 | 0.0/0.00 | 0.2/1.00 | 0.2/1.00 | 0.2/1.00 |
| q04 | Find French eighteenth-century armchairs | 39 | 0.0/0.00 | 0.0/0.00 | 0.5/0.54 | 1.0/1.00 | 0.1/0.22 | 1.0/1.00 |
| q05 | Find antique furniture with Boulle marq… | 12 | 0.0/0.00 | 0.0/0.00 | 0.0/0.00 | 0.7/0.80 | 0.3/0.47 | 0.7/0.79 |
| q06 | Find vintage designer handbags | 123 | 0.0/0.00 | 0.0/0.00 | 0.4/0.31 | 1.0/1.00 | 0.0/0.00 | 0.5/0.51 |
| q07 | Find French Baroque cabinets | 7 | 0.0/0.00 | 0.1/0.27 | 0.3/0.47 | 0.1/0.27 | 0.1/0.27 | 0.2/0.37 |
| q08 | diamond ring in white gold | 690 | 1.0/1.00 | 1.0/1.00 | 1.0/1.00 | 0.2/0.14 | 1.0/1.00 | 0.8/0.86 |
| q09 | Chinese porcelain vase | 39 | 1.0/1.00 | 1.0/1.00 | 0.5/0.61 | 0.9/0.78 | 1.0/1.00 | 1.0/1.00 |
| q10 | bague en or | 986 | 0.7/0.59 | 0.3/0.38 | 0.9/0.92 | 1.0/1.00 | 1.0/1.00 | 1.0/1.00 |
| q11 | montre bracelet | 339 | 1.0/1.00 | 0.7/0.66 | 0.9/0.86 | 1.0/1.00 | 1.0/1.00 | 1.0/1.00 |
| q12 | tapis persan | 208 | 1.0/1.00 | 1.0/1.00 | 0.0/0.00 | 0.0/0.00 | 1.0/1.00 | 1.0/1.00 |
| q13 | icône russe | 569 | 1.0/1.00 | 1.0/1.00 | 0.7/0.59 | 0.6/0.59 | 1.0/1.00 | 1.0/1.00 |
| q14 | pièces de monnaie en or | 189 | 0.5/0.51 | 0.1/0.09 | 0.1/0.14 | 0.0/0.00 | 0.7/0.64 | 0.7/0.57 |
| q15 | Art Deco lamp | 31 | 1.0/1.00 | 1.0/1.00 | 0.7/0.70 | 0.0/0.00 | 1.0/1.00 | 1.0/1.00 |
| q16 | bronze sculpture | 260 | 0.8/0.80 | 0.8/0.80 | 0.9/0.92 | 1.0/1.00 | 1.0/1.00 | 0.8/0.86 |
| q17 | mobilier Napoléon III | 24 | 0.0/0.00 | 0.0/0.00 | 0.4/0.36 | 0.8/0.84 | 0.8/0.84 | 0.8/0.85 |
| q18 | silver cutlery | 195 | 1.0/1.00 | 1.0/1.00 | 0.8/0.86 | 1.0/1.00 | 1.0/1.00 | 1.0/1.00 |
| q19 | timbres-poste | 37 | 0.5/0.58 | 0.5/0.58 | 0.5/0.57 | 1.0/1.00 | 1.0/1.00 | 0.9/0.93 |
| q20 | Hermès silk scarf | 37 | 1.0/1.00 | 1.0/1.00 | 0.3/0.42 | 0.1/0.14 | 1.0/1.00 | 1.0/1.00 |

## Analysis

Words the taxonomy did not understand (candidates for new concepts or synonyms): `antique` (1), `vintage` (1), `designer` (1), `diamond` (1), `white` (1), `persan` (1), `russe` (1), `monnaie` (1), `art` (1), `deco` (1), `silk` (1), `scarf` (1)

Concepts behind direct hits judged not relevant by the rules (check their terms and relationships): `fashion.handbags` (5), `material.gold` (5), `jewellery_watches.jewellery.rings` (2), `fine_art.sculpture.bronzes` (2), `period.napoleon_iii` (2), `fashion.footwear` (1), `furniture.desks` (1), `technique.boulle_marquetry` (1), `furniture.mirrors` (1), `furniture.case_furniture.cabinets` (1), `collectibles.stamps` (1)

Examples of relevant lots hybrid search did not return in its top 50:

- q01: 12742: 2 feuilles de dessins à l'encre de Chine représentant le Jardin zoolo…
- q02: none
- q03: none
- q04: 3084: Paire de fauteuils à dossier plat dit "à la reine" en bois sculpté et…; 3568: FAUTEUIL en acajou accotoirs crosses, FAUTEUIL de style Louis XVI gar…; 5862: Petite banquette en bois doré mouluré et sculpté de motifs floraux, s…
- q05: 6928: Rare et importante commode en bois noirci, placage d'écaille rouge, l…; 17204: 19ème siècle. Vitrine à une porte de style baroque français Napoléon…; 17205: Table de jeu du XIXe siècle, bien conservée, vraisemblablement frança…
- q06: 1249: LOUIS VUITTON; 1403: Lots de vêtements et chaussures vendu en vrac de 11h à 12h.; 1405: HERMÈS Paris
- q07: 11839: Meuble-bar « Modèle 1263 ». Aldo Tura pour TURA, Milan. Fin des année…; 17167: Armoire antique de style baroque, alliant les formes traditionnelles…; 17196: Armoire à pieds croisés de style baroque néerlandais du début du XVII…
- q08: 1398: Bague en émail sertie de brillants, GG 750/000, avec émail bleu, légè…; 2920: VAN CLEEF ARPELS; 5431: Une collection de huit bagues, comprenant une bague à diamants en gra…
- q09: 7083: Paire de grands vases en porcelaine de la famille rose, fin de la Dyn…; 12080: MEISSEN. ROSENTHAL. Mélange de porcelaine de 5 pièces. 1er + 2e choix…; 18131: UNE RARE BOUTEILLE À TABAC EN PORCELAINE BLEUE ET BLANCHE DE FORME «…
- q10: 6108: Bague "tank nœud" en or jaune (750) sertie de trois petits diamants t…; 6109: Bague ovale en or gris (750) ornée d'un cabochon d'onyx (usures) flan…; 6110: Alliance en or gris (750) sertie de 19 diamants taille brillant.
- q11: 2948: Trois montres de dames en or 18k dont une Jaeger-LeCoultre.; 2952: MOVADO; 2957: Ensemble de quatre montres d'homme de marque Omega, POP, Yema et Herb…
- q12: 10291: Tapis oriental ancien Gaswin, Perse, vers 1925, avec certificat; 10292: Tapis d'Orient et pont d'Orient Tabriz Mahi, Perse, âgé d'environ 40…; 10293: Grand tapis d'Orient Bakhtiar, Perse, âgé de 40 à 50 ans
- q13: 10423: UNE BELLE ICÔNE REPRÉSENTANT SOPHIA – LA SAGESSE DE DIEU. Russie, ate…; 10424: UNE ICÔNE MINIATURE REPRÉSENTANT « L'ŒIL DE DIEU QUI VOIT TOUT » Russ…; 10426: ICÔNE REPRÉSENTANT SOPHIE – LA SAGESSE DE DIEU Russie, XIXe siècle. T…
- q14: 2884: Royaume de France, atelier indéterminé; 5423: Un souverain d'or de l'époque victorienne, 1853; 5911: GRECE - Calabre - Tarente - Règne de Pyrrhus d’Épire (280-272 av J.C)
- q15: 9757: Deux suspensions Art Déco début XX ème en pâte de verre l’une est sig…; 17397: Lustre Art déco en bronze argenté et verre opalescent - attribué à; 17405: Lustre Art déco belge en verre satiné épais, orné d'un décor floral ;…
- q16: 2298: Un presse-papier chinois en bronze représentant un buffle d'eau; 2300: Un presse-papier chinois en bronze représentant une « bête mythique »…; 2665: ENCENSOIR CHINOIS EN BRONZE EN FORME D'HOMME SUR UN BUFFLE, DYNASTIE…
- q17: 17204: 19ème siècle. Vitrine à une porte de style baroque français Napoléon…; 19427: Bonheur du jour en placage de palissandre, marqueterie de nacre et la…; 21599: Meuble d'appui Napoléon III en marqueterie, facade et cotés violonnés…
- q18: 2989: Ensemble comprenant deux louches et une cuillère à punch (manche en c…; 2997: Ensemble en argent 1er titre 950‰ comprenant cuillères et fourchettes…; 3187: LUC LANEL - CHRISTOPHLE
- q19: 9392: 2 albums contenant plus de 250 Flammes avec de nombreuses villes comm…; 10341: Grande collection de vignettes publicitaires datant des environs de 1…; 12776: Lot d'environ 250 étiquettes, datant pour la plupart de la France du…
- q20: none

