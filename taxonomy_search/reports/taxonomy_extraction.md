# Taxonomy extraction report (Phase 3, rules only)

- Generated: 2026-11-07T19:31:46+00:00
- Lots read: **20,923** of 20,923 in the source; extractor version 3.3
- Extraction time: 10.0 s (newly extracted 20,770, cache hits 0, identical texts reused 153)
- **AI tokens used: 0** — every step is deterministic (patterns, lexicons, alignment statistics).

## 1. Extraction

Fields skipped because their content is in another language than the column says: `title_fr` 48, `title_en` 220, `description_fr` 433, `description_en` 1,003

| Extractor | Mentions (one per lot and term) |
|---|---|
| gazetteer | 49890 |
| material_en | 16252 |
| object_head | 9969 |
| technique_lexicon | 8297 |
| region_lexicon | 7605 |
| century | 4381 |
| maker_header | 2577 |
| brand_header | 2497 |
| object_compound | 2155 |
| maker_by | 1252 |
| style | 1122 |
| maker_attribution | 545 |
| period_epoque | 487 |
| material_trigger | 476 |

## 2. Candidates

Grouped by dimension and lemma; kept when seen in at least 3 lots.

| Dimension | Candidates kept | Below the lot threshold |
|---|---|---|
| object_type | 835 | 2751 |
| period | 41 | 100 |
| style | 45 | 323 |
| maker | 252 | 3475 |
| material | 544 | 1066 |
| technique | 20 | 0 |
| region | 23 | 0 |

Not proposed as new concepts:

- maker: capitalised title heading in a single auction only: 115
- maker: label belongs to an existing concept of another dimension: 1
- maker: matches an existing concept: 3
- material: label belongs to an existing concept of another dimension: 22
- material: matches an existing concept: 14
- object_type: is a maker/brand name: 27
- period: matches an existing concept: 8
- region: matches an existing concept: 4
- style: matches an existing concept: 6
- technique: matches an existing concept: 1

### Top object_type candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `object_type.bouteille` | Bouteille | Snuff bottle (alignment) | 309 | 13 | 0.6 |  |
| `jewellery_watches.jewellery.necklaces.pendentif` | Pendentif | Pendant (alignment) | 251 | 23 | 0.6 | `jewellery_watches.jewellery.necklaces` |
| `object_type.plat` | Plat | Dish (alignment) | 172 | 15 | 0.6 |  |
| `object_type.bouteille_a_tabac` | Bouteille à tabac | Snuff bottle (alignment) | 171 | 2 | 0.5 | `object_type.bouteille` |
| `numismatics.coins_banknotes.piece` | Pièces | Coin (alignment) | 157 | 21 | 0.6 | `numismatics.coins_banknotes` |
| `object_type.bol` | Bol | Bowl (alignment) | 151 | 11 | 0.6 |  |
| `object_type.plaque` | Plaque | Plaque (alignment) | 113 | 22 | 0.6 |  |
| `object_type.assiette` | Assiette | Porcelain plate (alignment) | 88 | 19 | 0.6 |  |
| `object_type.figurine` | Figurines | Figure (alignment) | 87 | 9 | 0.6 |  |
| `jewellery_watches.jewellery.necklaces.chaine` | Chaîne | Gold chain (alignment) | 78 | 14 | 0.6 | `jewellery_watches.jewellery.necklaces` |
| `object_type.croix` | Croix | Cross (alignment) | 77 | 13 | 0.6 |  |
| `object_type.edition` | Édition | Edition (alignment) | 75 | 3 | 0.6 |  |
| `decorative_arts.tableware.table_services.service` | Service | Service (alignment) | 72 | 21 | 0.6 | `decorative_arts.tableware.table_services` |
| `object_type.tasse` | Tasse | Cup (alignment) | 69 | 10 | 0.6 |  |
| `arms_militaria.arms.sabre` | Sabre | Saber (alignment) | 67 | 5 | 0.6 | `arms_militaria.arms` |

### Top period candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `period.20th_century` | XXe siècle | 20th century (rule) | 1708 | 47 | 0.9 |  |
| `period.21st_century` | XXIe siècle | 21st century (rule) | 164 | 8 | 0.9 |  |
| `period.premier_empire` | Époque Premier-Empire | Premier-Empire period (rule) | 51 | 1 | 0.64 |  |
| `period.restauration` | Époque Restauration | Restoration period (alignment) | 46 | 6 | 0.8 |  |
| `period.16th_century` | XVIe siècle | 16th century (rule) | 38 | 14 | 0.9 |  |
| `period.empire` | Époque Empire | Empire period (rule) | 25 | 7 | 0.8 |  |
| `period.second_empire` | Époque Second-Empire | Second-Empire period (rule) | 25 | 3 | 0.8 |  |
| `period.consulat` | Époque Consulat | Consulate period (alignment) | 12 | 2 | 0.8 |  |
| `period.15th_century` | XVe siècle | 15th century (rule) | 11 | 7 | 0.9 |  |
| `period.3rd_century` | IIIe siècle | 3rd century (rule) | 10 | 4 | 0.9 |  |
| `period.qing` | Époque Qing | Qing period (rule) | 10 | 2 | 0.8 |  |
| `period.kangxi` | Époque Kangxi | Kangxi period (rule) | 9 | 7 | 0.768 |  |
| `period.premiere_restauration` | Époque Première-Restauration | Early Restoration period (alignment) | 9 | 1 | 0.615 |  |
| `period.revolutionnaire` | Époque révolutionnaire | Revolutionary period (alignment) | 9 | 3 | 0.768 |  |
| `period.troisieme_republique` | Époque Troisième-République | Chatt period (alignment) | 9 | 1 | 0.615 |  |

### Top style candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `style.famille_rose` | Style famille rose | Famille rose (alignment) | 96 | 6 | 0.75 |  |
| `style.archaique` | Style archaïque | Archaistic (alignment) | 52 | 5 | 0.75 |  |
| `style.art_deco` | Style Art Déco | Art Déco style (rule) | 50 | 17 | 0.75 |  |
| `style.neogothique` | Style néogothique | Neo gothic (alignment) | 33 | 1 | 0.6 |  |
| `style.art_nouveau` | Style Art nouveau | Art nouveau style (rule) | 31 | 11 | 0.75 |  |
| `style.neoclassique` | Style néoclassique | néoclassique style (rule (French word 'néoclassique' kept)) | 28 | 2 | 0.75 |  |
| `style.empire` | Style Empire | Empire style (rule) | 25 | 12 | 0.75 |  |
| `style.antique` | Style antique | antique style (rule (French word 'antique' kept)) | 22 | 12 | 0.75 |  |
| `style.archaisant` | Style archaïsant | Archaistic style (alignment) | 17 | 5 | 0.75 |  |
| `style.baroque_2` | Style baroque | Baroque style (alignment) | 16 | 7 | 0.75 |  |
| `style.neo_louis_xv` | Style néo Louis XV | néo Louis XV style (rule) | 13 | 1 | 0.6 |  |
| `style.historiciste` | Style historiciste | Historicist (alignment) | 12 | 3 | 0.75 |  |
| `style.archaique_chinois` | Style archaïque chinois | Cong (alignment) | 9 | 2 | 0.72 |  |
| `style.biedermeier` | Style Biedermeier | Biedermeier style (rule) | 9 | 5 | 0.72 |  |
| `style.ming` | Style Ming | Ming style (rule) | 9 | 5 | 0.72 |  |

### Top maker candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `maker.raymond_thibesart` | Raymond Thibésart | Raymond Thibésart (rule) | 129 | 1 | 0.68 |  |
| `maker.meissen` | Meissen | Meissen (rule) | 63 | 5 | 0.7 |  |
| `maker.cartier` | Cartier | Cartier (rule) | 39 | 13 | 0.7 |  |
| `maker.ngc` | Ngc | Ngc (rule) | 39 | 1 | 0.44 |  |
| `maker.laurent_danchin` | Laurent Danchin | Laurent Danchin (rule) | 35 | 1 | 0.44 |  |
| `maker.baccarat` | Baccarat | Baccarat (rule) | 33 | 9 | 0.5 |  |
| `maker.pcg` | Pcgs | Pcgs (rule) | 33 | 1 | 0.44 |  |
| `maker.georg_jensen` | Georg Jensen | Georg Jensen (rule) | 31 | 3 | 0.85 |  |
| `maker.auguste_le_fort` | Auguste le Fort | Auguste le Fort (rule) | 27 | 1 | 0.44 |  |
| `maker.johann_friedrich_bottger` | Johann Friedrich Böttger | Johann Friedrich Böttger (rule) | 27 | 1 | 0.44 |  |
| `maker.adolf_lindberg` | Adolf Lindberg | Adolf Lindberg (rule) | 20 | 1 | 0.44 |  |
| `maker.christian_dior` | Christian Dior | Christian Dior (rule) | 20 | 4 | 0.55 |  |
| `maker.christofle` | Christofle | Christofle (rule) | 20 | 8 | 0.5 |  |
| `maker.dim` | Dim | Dim (rule) | 16 | 4 | 0.55 |  |
| `maker.chomo` | Chomo | Chomo (rule) | 15 | 1 | 0.68 |  |

### Top material candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `material.or_jaune` | Or jaune | Yellow gold (alignment) | 1212 | 21 | 0.65 |  |
| `material.or_gris` | Or gris | White gold (alignment) | 316 | 9 | 0.65 |  |
| `material.or_blanc` | Or blanc | Carat (alignment) | 272 | 13 | 0.65 |  |
| `material.tole` | Tôle | Sheet metal (alignment) | 233 | 12 | 0.45 |  |
| `material.faience` | Faïence | Earthenware (alignment) | 219 | 18 | 0.45 |  |
| `material.metal_dore` | Métal doré | Tone metal (alignment) | 217 | 27 | 0.65 |  |
| `material.acier` | Acier | Steel (alignment) | 214 | 21 | 0.45 |  |
| `material.metal_argente` | Métal argenté | Silver plated (alignment) | 150 | 22 | 0.65 |  |
| `material.fer` | Fer | Iron (alignment) | 132 | 19 | 0.65 |  |
| `material.email` | Émail | Cloisonne enamel (alignment) | 120 | 21 | 0.65 |  |
| `material.acajou` | Acajou | Mahogany (alignment) | 117 | 16 | 0.65 |  |
| `material.jade` | Jade | Jade (alignment) | 104 | 9 | 0.45 |  |
| `material.soie` | Soie | Silk (alignment) | 104 | 22 | 0.65 |  |
| `material.tissu` | Tissu | Fabric (alignment) | 98 | 24 | 0.65 |  |
| `material.cristal` | Cristal | Baccarat (alignment) | 97 | 24 | 0.45 |  |

### Top technique candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `technique.peinture_a_l_huile` | Peinture à l'huile | Oil painting (rule) | 1780 | 41 | 0.6 |  |
| `technique.serti` | Serti | Gem setting (rule) | 1547 | 28 | 0.6 |  |
| `technique.gravure` | Gravure | Engraving (rule) | 776 | 51 | 0.6 |  |
| `technique.sculpture_taille` | Sculpture (taille) | Carving (rule) | 760 | 38 | 0.6 |  |
| `technique.emaillage` | Émaillage | Enamelling (rule) | 626 | 41 | 0.6 |  |
| `technique.laque` | Laque | Lacquer (rule) | 413 | 40 | 0.6 |  |
| `technique.ajoure` | Ajouré | Openwork (rule) | 399 | 35 | 0.6 |  |
| `technique.patine` | Patine | Patination (rule) | 380 | 36 | 0.6 |  |
| `technique.ciselure` | Ciselure | Chasing (rule) | 333 | 36 | 0.6 |  |
| `technique.gouache` | Gouache | Gouache (rule) | 205 | 28 | 0.6 |  |
| `technique.acrylique` | Acrylique | Acrylic (rule) | 184 | 20 | 0.6 |  |
| `technique.broderie` | Broderie | Embroidery (rule) | 136 | 21 | 0.6 |  |
| `technique.filigrane` | Filigrane | Filigree (rule) | 136 | 27 | 0.6 |  |
| `technique.pastel` | Pastel | Pastel (rule) | 119 | 30 | 0.6 |  |
| `technique.repousse` | Repoussé | Repoussé (rule) | 103 | 18 | 0.6 |  |

### Top region candidates

| Key | French | English (source) | Lots | Auctions | Confidence | Proposed parent |
|---|---|---|---|---|---|---|
| `region.suede` | Suède | Sweden (rule) | 850 | 13 | 0.6 |  |
| `region.russie` | Russie | Russia (rule) | 743 | 27 | 0.6 |  |
| `region.allemagne` | Allemagne | Germany (rule) | 603 | 40 | 0.6 |  |
| `region.angleterre` | Angleterre | England (rule) | 310 | 35 | 0.6 |  |
| `region.perse` | Perse | Persia (rule) | 208 | 12 | 0.6 |  |
| `region.suisse` | Suisse | Switzerland (rule) | 156 | 25 | 0.6 |  |
| `region.belgique` | Belgique | Belgium (rule) | 130 | 28 | 0.6 |  |
| `region.autriche` | Autriche | Austria (rule) | 115 | 24 | 0.6 |  |
| `region.danemark` | Danemark | Denmark (rule) | 105 | 15 | 0.6 |  |
| `region.grece` | Grèce | Greece (rule) | 100 | 19 | 0.6 |  |
| `region.venise` | Venise | Venice (rule) | 86 | 24 | 0.6 |  |
| `region.inde` | Inde | India (rule) | 85 | 25 | 0.6 |  |
| `region.espagne` | Espagne | Spain (rule) | 83 | 22 | 0.6 |  |
| `region.pays_bas` | Pays-Bas | Netherlands (rule) | 73 | 22 | 0.6 |  |
| `region.afrique` | Afrique | Africa (rule) | 65 | 22 | 0.6 |  |

## 3. Existing concepts found in the lots

163 existing concepts are attested by at least one lot. Top 25:

| Concept | Lots | of which ambiguous term only | Top Drouot categories | English found by alignment | English labels in taxonomy |
|---|---|---|---|---|---|
| `material.gold` | 4088 | 3314 | Bagues (979), Colliers, colliers de perles et sautoirs (643) | gold | Gold |
| `material.wood` | 2696 | 0 | Icônes (664), Arts d'Asie (207) | chinese | Wood |
| `region.china` | 1975 | 0 | Arts d'Asie (1225), Vases (173) | chinese | China, Chinese |
| `period.19th_century` | 1872 | 0 | Icônes (366), Arts d'Asie (318) | qing dynasty | 19th century, Nineteenth century |
| `material.silver` | 1795 | 1795 | Pièces et billets (219), Ménagères et Couverts (165) | silver | Silver |
| `decorative_arts.silver` | 1763 | 1744 | Pièces et billets (215), Ménagères et Couverts (165) | silver | Silver, Silverware |
| `decorative_arts.frames` | 1615 | 0 | Tableaux anciens (336), Arts d'Asie (183) | frame | Frames |
| `fine_art.paintings` | 1602 | 0 | Tableaux anciens (427), Tableaux modernes (296) | painting | Paintings |
| `material.glass` | 1535 | 0 | Verreries (164), Montres (145) | glass | Glass |
| `jewellery_watches.jewellery.rings` | 1412 | 0 | Bagues (1048), Bijoux (54) | ring | Rings |
| `material.metal` | 1280 | 0 | Jouets et maquettes (193), Sacs à main (86) | metal | Metal |
| `region.france` | 1273 | 0 | Tableaux anciens (166), Voitures, vélos et autres (99) | france | France, French |
| `fine_art.sculpture.bronzes` | 1001 | 1000 | Bronzes (228), Arts d'Asie (122) | bronze | Bronze sculptures, Bronzes |
| `material.bronze` | 1001 | 1001 | Bronzes (228), Arts d'Asie (122) | bronze | Bronze |
| `decorative_arts.boxes` | 992 | 0 | Jouets et maquettes (128), Coffrets et boîtes (108) | box | Boxes, Caskets |
| `material.brass` | 793 | 0 | Armes (134), Lustres (69) | brass | Brass |
| `material.porcelain` | 717 | 0 | Arts d'Asie (185), Céramiques (174) | porcelain | Porcelain |
| `decorative_arts.vases` | 681 | 0 | Vases (339), Arts d'Asie (179) | vase | Vases |
| `fine_art.paintings.icons` | 677 | 4 | Icônes (662), Religions (8) | icon | Icons |
| `jewellery_watches.jewellery.bracelets` | 671 | 0 | Bracelets (302), Montres (274) | bracelet | Bracelets |
| `material.leather` | 656 | 0 | Montres (130), Armes (110) | leather | Leather |
| `fine_art.works_on_paper` | 653 | 0 | Dessins (227), Lithographies (87) |  | Drawings, Works on paper |
| `period.18th_century` | 615 | 0 | Icônes (87), Arts d'Asie (85) | century | 18th century, Eighteenth century |
| `furniture.tables` | 598 | 0 | Tables (245), Lampes et lanternes (74) | table | Tables |
| `arms_militaria.arms` | 504 | 0 | Armes (141), Appliques (38) | arm | Arms, Weapons |

## 4. Suggestions for reviewers (not imported)

- Possible spelling variants: 17
  - `material.bois_noir` ≈ `material.bois_noirci` (bois noir / bois noirci, similarity 0.9)
  - `material.differente` ≈ `material.different` (differentes / differents, similarity 0.952)
  - `material.formant` ≈ `material.format` (formant / format, similarity 0.923)
  - `material.plexiglas` ≈ `material.plexiglass` (plexiglas / plexiglass, similarity 0.947)
  - `material.porcelaine_bleu` ≈ `material.porcelaine_bleue` (porcelaine bleu / porcelaine bleue, similarity 0.968)
  - `material.retrait` ≈ `material.retraite` (retrait / retraite, similarity 0.933)
  - `object_type.august` ≈ `fine_art.prints.lithographs.auguste` (august / auguste, similarity 0.923)
  - `object_type.bernard` ≈ `fine_art.prints.lithographs.bernhard` (bernard / bernhard, similarity 0.933)
  - `object_type.bouteille_a_priser` ≈ `object_type.bouteille_a_prisse` (bouteille a priser / bouteille a prisse, similarity 0.944)
  - `books_manuscripts.comics.chevalier` ≈ `jewellery_watches.jewellery.rings.chevaliere` (chevalier / chevaliere, similarity 0.947)
  - `decorative_arts.silver.cutlery.cuillere` ≈ `decorative_arts.silver.cutlery.cuiller` (cuilleres / cuillers, similarity 0.941)
  - `numismatics.medals.etoile` ≈ `decorative_arts.textiles.etole` (etoile / etole, similarity 0.909)
  - `decorative_arts.carpets.keschan` ≈ `decorative_arts.carpets.keshan` (keschan / keshan, similarity 0.923)
  - `period.ming` ≈ `period.qing` (epoque ming / epoque qing, similarity 0.909)
  - `period.12th_century` ≈ `period.13th_century` (xiie siecle / xiiie siecle, similarity 0.957)
- Possible synonyms (French terms aligned to the same English term): 44
  - 'albert wigand' (material): `material.collage`, `material.lusace`
  - 'burl wood' (material): `material.bois_de_loupe`, `material.bois_de_racine`
  - 'otto lange' (material): `material.croatie`, `material.ile_de_france`
  - 'terracotta' (material): `material.terracotta`, `material.terre`
  - 'token obverse' (material): `material.abrege`, `material.exergue`
  - 'veit hofmann' (material): `material.bulgarie`, `material.pologne`
  - 'white porcelain' (material): `material.porcelaine_blanche`, `material.porcelaine_bleue`
  - 'ammunition' (object_type): `arms_militaria.arms.munition`, `object_type.munition_de_categorie`
  - 'bottle qing' (object_type): `object_type.fiole`, `object_type.fiole_a_tabac`
  - 'brush pot' (object_type): `object_type.pot`, `object_type.pot_a_pinceau`
  - 'brush washer' (object_type): `object_type.lavoir`, `object_type.lavoir_a_pinceau`
  - 'centrepiece' (object_type): `object_type.centre`, `object_type.centre_de_table`
  - 'champagne bucket' (object_type): `object_type.seau`, `object_type.seau_a_champagne`
  - 'chess set' (object_type): `object_type.jeu`, `object_type.jeu_d_echec`
  - 'cigarette case' (object_type): `object_type.etui`, `object_type.etui_a_cigarette`

## 5. Validation targets

### Footwear

| Concept | Lots | Ambiguous-only lots | Top categories | English alignment | Example |
|---|---|---|---|---|---|
| `fashion.footwear` | 23 | 0 | Arts d'Asie (5), Tableaux anciens (2), Céramiques (2) | shoe | lot 1403: Lots de vêtements et chaussures vendu en vrac de 11h à 12h. |
| `fashion.footwear.ankle_boots` | 1 | 0 | Chaussures (1) |  | lot 10343: Zaha Hadid pour Lacoste, bottines pour femme, comme neuves, dans leur boîte d'origi… |
| `fashion.footwear.boots` | 5 | 0 | Chaussures (2), Photographies (1), Bronzes (1) | boot | lot 7320: Jean PROESS (1896-1978), Bottes de blé. |
| `fashion.footwear.high_heels` | 51 | 51 | Armes (43), Chaussures (3), Casques et uniformes (1) | officer | lot 3718: …ne alternating fuller on each side, signed at the heel: “Coulaux” and “Klingenthal,” engraved with… |
| `fashion.footwear.loafers` | 1 | 0 | Chaussures (1) |  | lot 18477: Mocassins à mors de cheval en toile à monogramme bleu turqu… |
| `fashion.footwear.pumps` | 14 | 13 | Voitures, vélos et autres (4), Buffets (1), Livres religieux (1) | pump | lot 1322: …🔩 Work performed in 2020: - Timing belt and water pump replacement - Replacement of accessory belt… |
| `fashion.footwear.sandals` | 5 | 0 | Chaussures (2), Bronzes (1), Bois (1) |  | lot 9992: …héroïque, vêtu uniquement d’un pagne, chaussé de sandales lacées (talaria) et coiffé d’un chapeau… |
| `fashion.footwear.sneakers` | 5 | 2 | Chaussures (2), Commodes (1), Chaises (1) | sneaker | lot 1227: PAIRE DE SNEAKERS "ACE" en toile enduite suprême GG verte et bandes… |

- Drouot category *Chaussures*: 12 lots; 9 contain an unambiguous footwear term (75.0%). Without one: lots 3858, 4039, 4042.
- 38 lots contain an unambiguous footwear term; 29 of them are outside the *Chaussures* category (e.g. Chinese shoes in Asian art, shoes mentioned in paintings).
- New footwear candidates from extraction: 0 — the vocabulary found in the lots is already in the seed; new words (e.g. 'tennis') occur in fewer lots than the threshold

### Louis XIV

| Reign | Lots dated to the period | Lots in the style | Lots with both |
|---|---|---|---|
| louis_xiii | 0 | 0 | 0 |
| louis_xiv | 5 | 7 | 0 |
| regence | 6 | 9 | 0 |
| louis_xv | 14 | 90 | 0 |
| louis_xvi | 36 | 95 | 1 |
| napoleon_iii | 58 | 21 | 0 |

**Louis XIV period** — 5 lots (0 through an ambiguous term only):

- lot 3672: Époque Louis XIV. Très bon état.
- lot 6928: …aille rouge, laiton et étain par Nicolas Sageot d'époque Louis XIV
- lot 6933: …placage de noyer, d'amarante et de palissandre d'époque Louis XIV

**Louis XIV style** — 7 lots (0 through an ambiguous term only):

- lot 6442: …s et stuc peint et patiné, à décor à la Bérain de style Louis XIV. Estampille et étiquette en papier d'origine (acc…
- lot 7059: …rose et monture en bronzé doré par Susse Frères, style Louis XIV de la seconde partie du XIXe siècle
- lot 11346: …Encadré sous verre dans un cadre en stuc doré de style Louis XIV. L'œuvre n'a pas été encadrée. Insensiblement bru…

**Boulle marquetry** — 18 lots (12 through an ambiguous term only):

- lot 3009: …dans un coffret à décor en marqueterie de style "Boulle". Fin du XIXe et XXe siècle. (petits éclats et ma…
- lot 3095: Cartel de forme mouvementée en marqueterie d'écaille et de laiton
- lot 3581: SEMAINIER en bois noirci et marqueterie BOULLE. Dessus de marbre blanc.

- Boulle marquetry together with the Louis XIV *period*: lots [6928]; with the Louis XIV *style*: lots none.
- Related period/style candidates: Époque Empire (25), Époque Louis-Philippe (7), Époque Premier-Empire (51), Époque Second-Empire (25), Style Empire (25), Style Louis XV Bois (5), Style néo Louis XV (13), Style néo Transition Louis (3)

## 6. Import into `auction_search`

Mode: **committed**. Draft version `0.2.0`; all rows `candidate`, provenance `rule_extraction`.

| This run | Value |
|---|---|
| version_label | 0.2.0 |
| considered | 1760 |
| below_min_confidence | 808 |
| concepts_inserted | 0 |
| concepts_refreshed | 952 |
| concepts_kept_reviewed | 0 |
| terms_inserted | 0 |
| relationships_inserted | 0 |
| evidence_inserted | 0 |
| attestations_recorded | 163 |

| Version 0.2.0 in the database after this run | Rows |
|---|---|
| taxonomy_concepts | 952 |
| taxonomy_terms | 1748 |
| taxonomy_relationships | 290 |
| taxonomy_evidence (all versions) | 5400 |

- skipped — en label already preferred by another material: 3
- skipped — en label already preferred by another object_type: 21

