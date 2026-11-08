# Embedding model benchmark (Phase 5)

- Lots: 20,923; task A sample: 1,000 lots; task B: 16 English queries over **French-only** text of all lots. Models run locally; AI tokens: 0.
- **Chosen: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`** (best combined task A MRR + task B precision@10).

| Model | Dims | Device | Load s | Docs/s | A recall@1 | A recall@10 | A MRR | B precision@10 | Vector storage (all lots) |
|---|---|---|---|---|---|---|---|---|---|
| `intfloat/multilingual-e5-small` | 384 | mps | 12.33 | 442.0 | 0.843 | 0.967 | 0.892 | 0.375 | 32.1 MB |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | 384 | mps | 12.87 | 574.7 | 0.687 | 0.86 | 0.746 | 0.569 | 32.1 MB |

Task A: an English title must find its own French description among the sample. Task B: share of the top 10 French lots whose Drouot category is relevant to the English query (the category is assigned by the auction house, so it is an independent but coarse judge).

## `intfloat/multilingual-e5-small` — English queries

| Query | P@10 | Top 3 French lots |
|---|---|---|
| pair of women's shoes | 0.0 | 9429: Kitaro «The light of the spirit», REF: 924 163-1, pochette:  · 16508: Bague « Square » WEMPE BY KIM sertie de diamants noirs total · 18822: EFVA ATTLING, pendentif avec chaîne, pendentif « Beväpna Dig |
| Louis XV chest of drawers | 0.3 | 6978: Large commode de forme galbée estampillée Dautriche d'epoque · 18033: PAIRE DE CHEVETS de style Louis XV de section carrée façon c · 8789: Paire de chevets |
| Chinese porcelain vase | 0.8 | 17881: CHINE. Vase en porcelaine de forme ovoïde à décor polychrome · 17868: CHINE. Paire de vases montés en candélabre en porcelaine de  · 17339: Vase chinois en porcelaine marquée, orné d'un décor floral p |
| diamond engagement ring | 0.6 | 18806: EFVA ATTLING, bague, Rock Star Ring, or blanc 18 carats, dia · 18799: EFVA ATTLING, bague « Full Eternity », collection « Big Star · 18568: ENGELBERT, bague « Spin Ring Pavé », or blanc 18 carats, dia |
| landscape oil painting | 0.7 | 17221: Peinture à l'huile du XIXe siècle sur carton représentant un · 17174: Fin du XVIIIe siècle. Peinture à l'huile flamande sur pannea · 2815: Francesco Zuccarelli (Pitigliano 1702-1788 Florence) |
| silver cutlery set | 0.2 | 5407: Cuillère à portion individuelle, avec cuvette en forme de co · 3000: CHRISTOFLE. · 5357: Raymond Campbell (1956-) Britannique. « Still Life on a Ledg |
| Swiss automatic wristwatch | 0.3 | 5756: Montre en métal doré Verni, Suisse. · 10258: Girard-Perregaux Gyromatic, montre-bracelet vintage, Suisse, · 10262: Six montres-bracelets suisses Windgassen, automatiques et à  |
| gold coin | 0.1 | 9430: Queen, «A kind of Magic», REF: EU3509, pochette gatefold: VG · 1877: Atelier de Jan Gossaert dit Mabuse (?Maubeuge circa 1478-cir · 1878: Attribué à Cornelis Cornelisz. Kunst (Leyde circa 1493-circa |
| Persian rug | 0.5 | 12556: Luri Gabbeh. Environ 120 cm x 79 cm. Vers 1990. Tapis orient · 12549: Luri Gabbeh. Environ 140 cm x 107 cm. Vers 1980. Tapis orien · 12533: Luri Gabbeh. Environ 164 cm x 101 cm. Vers 1990. Tapis orien |
| bronze animal sculpture | 1.0 | 17676: Grande sculpture en bronze représentant un « cerf avec son f · 17453: Sculpture « Toy, Boston Terrier » en bronze d'après François · 9729: 3 - Art Moderne (océan) : Sculpture animalière en bronze pat |
| luxury leather handbag | 0.0 | 4052: Louis Stanislas D'Arcy de la ROCHETTE (1731-1802). A chart o · 9434: Stevie Ray Vaughan and double trouble «In step», REF: EPC 46 · 14807: Danemark, Frédéric III Sieg 42.2-H84A, 1 couronne, 1651, 18, |
| antique bookcase | 0.1 | 17725: PAIRE DE CASSOLETTES formant bougeoir de style Louis XVI en  · 18311: BOUTEILLE À TABAC EN PORCELAINE DE LA FAMILLE ROSE « CENT AN · 12166: Grande Bible ancienne. Ancien et Nouveau Testament. XVIIIe s |
| crystal chandelier | 0.0 | 9330: VINGT-ET-UN chandeliers en métal laqué noir à cinq bras de l · 12375: Ensemble mixte de chandeliers de 7 pièces. 925 livres sterli · 12948: Crucifix sur pied et une paire de chandeliers, XIXe siècle o |
| cavalry sword | 0.6 | 3813: Sabre de cavalerie légère ou d'infanterie montée, garde à un · 14843: Antiquité, République romaine, L. Calpurnius Piso Frugi Craw · 3784: Sabre de cavalerie modèle an XI, garde à trois branches en l |
| Russian orthodox icon | 0.8 | 19267: Icône orthodoxe russe représentant la Vierge à l'enfant de K · 10043: Œuf de Pâques orthodoxe en monture d'argent, Russie, XXe siè · 11032: DEUX ICÔNES REPRÉSENTANT LA MÈRE DE DIEU ET UNE ICÔNE EN BRO |
| vintage advertising poster | 0.0 | 6556: DINH VAN, Epinglette cœur ajouré en or jaune 750°/°°(18K). S · 18822: EFVA ATTLING, pendentif avec chaîne, pendentif « Beväpna Dig · 3237:  |

## `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` — English queries

| Query | P@10 | Top 3 French lots |
|---|---|---|
| pair of women's shoes | 0.2 | 18479: PRADA · 13082: 2 objets phalliques, XXe siècle. 1 x tire-bouchon, manche en · 4335: Deux socles chinois en bois sculpté, XIXe/XXe siècle 十九/二十世紀 |
| Louis XV chest of drawers | 0.0 | 5874: Table de chevet en bois mouluré et sculpté, à un tiroir et u · 5872: Buffet en bois mouluré et sculpté de fleurettes, à deux port · 3570: COMMODE d'entre-deux en bois de placage. Dessus de marbre gr |
| Chinese porcelain vase | 1.0 | 17339: Vase chinois en porcelaine marquée, orné d'un décor floral p · 4439: Un magnifique vase cylindrique chinois de style « famille ro · 17734: CHINE. Vase couvert en porcelaine de forme balustre à décor  |
| diamond engagement ring | 0.7 | 8460: Imposante bague jonc en or jaune rhodié 750°/.(18K) 9g55 ser · 12249: Deux bagues de dames. 585 en or blanc avec ornements en diam · 5443: Une bague en or 9 carats sertie de saphirs et de diamants, c |
| landscape oil painting | 0.9 | 17366: Paire de peintures à l'huile sur toile belges - vers 1900 · 8775: Trumeau de style Louis XV · 9599: 2 huiles sur toile et une huile sur panneau, 2 natures morte |
| silver cutlery set | 0.4 | 3000: CHRISTOFLE. · 13520: CAILAR BAYARD. · 5749: Bracelet en métal argenté à décor de mors, dans le goût d'He |
| Swiss automatic wristwatch | 0.8 | 10262: Six montres-bracelets suisses Windgassen, automatiques et à  · 13458: lot : · 15700: Zénith, Rodania, Bimesa, Baume & Mercier, Certina, Alpina, C |
| gold coin | 0.1 | 10246: Deux colliers de créateur, argent/or · 6127: Broche-pendentif circulaire en or jaune (750) ornée d'une pi · 10239: Trois épingles à cravate, 2 en or, dont une plaquée or, d'ép |
| Persian rug | 0.9 | 10293: Grand tapis d'Orient Bakhtiar, Perse, âgé de 40 à 50 ans · 19055: Paire de tapis Djosan anciens, Perse, début du XXe siècle, l · 12798: Carreau de céramique persan de l'époque Qajar, XIXe siècle o |
| bronze animal sculpture | 0.7 | 1594: Statue chinoise en bronze représentant un chien-lion, dynast · 21545: SOLEAU. · 21478: Pierre Jules MENE. |
| luxury leather handbag | 0.9 | 8615: LOUIS VUITTON, · 15568: Chanel · 3452: OMEGA De Ville |
| antique bookcase | 0.3 | 12774: Important lot de livres, XVIIIe-XIXe siècles, une caisse de  · 13346: Pupitre de lecture de la Forêt-Noire, 1er semestre du XXe si · 13320: Escalier de bibliothèque, 1er moitié du XXe siècle, bois dur |
| crystal chandelier | 0.2 | 12738: 3 chandeliers figuratifs, milieu du XXe siècle, en bronze do · 17829: GRAND LUSTRE montgolfière à dix bras de lumière (non électri · 19346: Important lustre en cristal taillé à huit bras de lumières,  |
| cavalry sword | 1.0 | 3813: Sabre de cavalerie légère ou d'infanterie montée, garde à un · 3808: Sabre d'officier de chasseurs à cheval modèle 1792, garde en · 3814: Sabre d'officier de cavalerie légère, garde en fer à une bra |
| Russian orthodox icon | 0.8 | 10913: UNE BELLE ICÔNE PATRONALE REPRÉSENTANT LA MÈRE DE DIEU DU SI · 19267: Icône orthodoxe russe représentant la Vierge à l'enfant de K · 10425: UNE PETITE ET BELLE ICÔNE REPRÉSENTANT « L'ŒIL DE DIEU QUI V |
| vintage advertising poster | 0.2 | 8922: DECK, LEO (1908 Berne 1997) : « Auf der Lueg » · 1670: Long panneau de soie brodé représentant des « immortels » su · 20163: Affiche "Warhol Basquiat Paintings" |

