# Initial data quality report

- Generated: 2026-11-07T17:43:20+00:00
- Target: `postgresql://(libpq default user)@localhost:5432/events_monitor_db schema=drouot_collector`
- Tables: auctions `drouot_collector.auctions`, lots `drouot_collector.lots`
- Scope: all lots — **20,923 lots analysed**
- Lots whose auction is missing (orphans): 0
- Mode: read-only; no data was modified.

## 1. Auctions

| Measure | Value |
|---|---|
| Auctions | 122 |
| Auctions with lots (in scope) | 96 |
| Auctions without lots (in scope) | 26 |
| Lots per auction (min / median / avg / max) | 3 / 152 / 217.9 / 1164 |
| Distinct auction houses | 85 |

| Date column | Earliest | Latest | Nulls |
|---|---|---|---|
| `starts_at` | 2026-11-01 18:00:00+01:00 | 2026-11-07 15:00:00+01:00 | 26 |
| `auction_date` | 2026-11-01 | 2026-11-07 | 26 |

Top auction houses:

| Auction house | Auctions |
|---|---|
|  | 26 |
| Bonhams - Cornette de Saint Cyr maison de ventes | 4 |
| Art Research Paris | 2 |
| Chiswick Auctions | 2 |
| De Baecque et Associés | 2 |
| Haynault Maison de Ventes aux Enchères | 2 |
| Historia Auktionshaus | 2 |
| Hôtel des ventes Giraudeau | 2 |
| Pousse-Cornet | 2 |
| Rossini | 2 |
| A.Blanchy \| E.Lacombe - Bordeaux Chartrons - Bordeaux Enchères | 1 |
| AB Philea | 1 |
| Acacia Enchères | 1 |
| Alastair Gibson Auctions | 1 |
| Aplanos - Hôtel des ventes de Dieppe | 1 |
| Aponem | 1 |
| Arles Enchères | 1 |
| Art Richelieu | 1 |
| Artcurial | 1 |
| Artenchères | 1 |
| Artesia | 1 |
| Aste di Antiquariato Boetto | 1 |
| Audap & Associés | 1 |
| Auktionshaus Pari | 1 |
| Auktionshaus Schreiber | 1 |

## 2. Null and blank values

### `lots`

| Column | Role | Nulls | Blank ('') | Missing % | Distinct |
|---|---|---|---|---|---|
| `id` | identifier | 0 |  | 0.0% | 20,923 |
| `source` | source | 0 | 0 | 0.0% | 1 |
| `auction_id` | identifier | 0 | 0 | 0.0% | 96 |
| `lot_id` | identifier | 0 | 0 | 0.0% | 20,923 |
| `lot_number` | lot_number | 9 | 0 | 0.0% | 3,787 |
| `title_fr` | title (fr) | 3 | 0 | 0.0% | 19,287 |
| `description_fr` | description (fr) | 3 | 0 | 0.0% | 20,759 |
| `title_en` | title (en) | 3 | 0 | 0.0% | 19,264 |
| `description_en` | description (en) | 3 | 0 | 0.0% | 20,761 |
| `category_fr` | category (fr) | 15 | 0 | 0.1% | 105 |
| `category_en` | category (en) | 15 | 0 | 0.1% | 105 |
| `currency` | currency | 2 | 0 | 0.0% | 4 |
| `image_url` | image_url | 2 | 0 | 0.0% | 20,827 |
| `lot_url_fr` | url (fr) | 0 | 0 | 0.0% | 20,923 |
| `lot_url_en` | url (en) | 0 | 0 | 0.0% | 20,923 |
| `details_status` | status | 0 | 0 | 0.0% | 3 |
| `last_collected_run_id` | identifier | 0 |  | 0.0% | 12 |
| `last_error` | error | 20920 | 0 | 100.0% | 3 |
| `updated_at` | record_timestamp | 0 |  | 0.0% | 20,923 |

### `auctions`

| Column | Role | Nulls | Blank ('') | Missing % | Distinct |
|---|---|---|---|---|---|
| `id` | identifier | 0 |  | 0.0% | 122 |
| `source` | source | 0 | 0 | 0.0% | 1 |
| `auction_id` | identifier | 0 | 0 | 0.0% | 122 |
| `title_fr` | title (fr) | 26 | 0 | 21.3% | 96 |
| `description_fr` | description (fr) | 0 | 0 | 0.0% | 105 |
| `title_en` | title (en) | 26 | 0 | 21.3% | 96 |
| `description_en` | description (en) | 0 | 0 | 0.0% | 108 |
| `starts_at` | date | 26 |  | 21.3% | 39 |
| `auction_date` | date | 26 |  | 21.3% | 7 |
| `auction_house` | auction_house | 26 | 0 | 21.3% | 85 |
| `catalogue_page_count` | count | 0 |  | 0.0% | 11 |
| `auction_url_fr` | url (fr) | 0 | 0 | 0.0% | 122 |
| `auction_url_en` | url (en) | 0 | 0 | 0.0% | 122 |
| `details_status` | status | 0 | 0 | 0.0% | 1 |
| `catalogue_status` | status | 0 | 0 | 0.0% | 2 |
| `last_error` | error | 92 | 0 | 75.4% | 1 |
| `updated_at` | record_timestamp | 0 |  | 0.0% | 122 |

## 3. Title and description lengths (characters, non-empty values)

| Table.column | Non-empty | Min | P10 | Median | P90 | Max | Avg | < 20 chars |
|---|---|---|---|---|---|---|---|---|
| `lots.title_fr` | 20,920 | 3 | 25 | 93 | 341 | 6184 | 153.2 | 1479 |
| `lots.title_en` | 20,920 | 3 | 24 | 87 | 310 | 4983 | 139.6 | 1568 |
| `lots.description_fr` | 20,920 | 8 | 102 | 241 | 752 | 6185 | 392.8 | 9 |
| `lots.description_en` | 20,920 | 8 | 98 | 228 | 681 | 5117 | 354.0 | 9 |
| `auctions.title_fr` | 96 | 14 | 21 | 49 | 100 | 170 | 54.6 | 7 |
| `auctions.title_en` | 96 | 10 | 19 | 42 | 101 | 196 | 52.3 | 10 |
| `auctions.description_fr` | 122 | 31 | 63 | 72 | 91 | 122 | 74.5 | 0 |
| `auctions.description_en` | 122 | 49 | 53 | 63 | 83 | 112 | 66.3 | 0 |

## 4. Duplicates

| Check | Duplicate groups | Rows involved |
|---|---|---|
| same lot number within an auction (source, auction_id, lot_number) | 216 | 469 |
| identical title_fr shared by several lots (36 groups span >1 auction) | 647 | 2,280 |
| identical title_en shared by several lots (39 groups span >1 auction) | 677 | 2,333 |
| identical description_fr shared by several lots (1 groups span >1 auction) | 84 | 245 |
| identical description_en shared by several lots (2 groups span >1 auction) | 84 | 243 |
| identical title+description (fr) — possible re-listed lots | 82 | 241 |

Most repeated — same lot number within an auction (source, auction_id, lot_number):

- source=drouot, auction_id=182469, lot_number=192, n=4
- source=drouot, auction_id=187114, lot_number=71, n=4
- source=drouot, auction_id=182469, lot_number=120, n=4
- source=drouot, auction_id=183769, lot_number=301, n=4
- source=drouot, auction_id=186559, lot_number=86, n=4

Most repeated — identical title_fr shared by several lots (36 groups span >1 auction):

- count=127, auctions=1, text=Raymond THIBÉSART (1874-1968)
- count=43, auctions=5, text=LOUIS VUITTON
- count=29, auctions=1, text=BIBLIOTHEQUE DE LA PLEIADE
- count=29, auctions=1, text=VDL. Réunion de 50 photographies de la ville de Luxembourg ville prises dans les années 70.
- count=25, auctions=1, text=HERMÈS

Most repeated — identical title_en shared by several lots (39 groups span >1 auction):

- count=127, auctions=1, text=Raymond THIBÉSART (1874–1968)
- count=43, auctions=5, text=LOUIS VUITTON
- count=29, auctions=1, text=VDL. A collection of 50 photographs of Luxembourg City taken in the 1970s.
- count=29, auctions=1, text=LA PLEIADE LIBRARY
- count=25, auctions=1, text=HERMÈS

Most repeated — identical description_fr shared by several lots (1 groups span >1 auction):

- count=29, auctions=1, text=VDL. Réunion de 50 photographies de la ville de Luxembourg ville prises dans les années 70. On y voit des dégradations des routes, des travaux en cours, des inf
- count=8, auctions=1, text=GDL. Réunion de 50 photographies de divers endroits du pays prises dans les années 70. On y voit des dégradations des routes, des travaux en cours, des infracti
- count=8, auctions=1, text=Raymond THIBÉSART (1874-1968) Etude de nu masculin debout. Réunion de deux dessins sur papier au graphite noir. Haut. : 63,5 cm Long. : 48 cm Pliures, tâches,
- count=7, auctions=6, text=Lot non venu
- count=7, auctions=1, text=Raymond THIBÉSART (1874-1968) Etude de nu masculin debout. Dessin sur papier au graphite noir. Haut. : 63,5 cm Long. : 48 cm Pliures, tâches, rousseurs et déc

Most repeated — identical description_en shared by several lots (2 groups span >1 auction):

- count=29, auctions=1, text=VDL. A collection of 50 photographs of Luxembourg City taken in the 1970s. The images depict deteriorating roads, construction sites, traffic violations, storef
- count=8, auctions=1, text=GDL. A collection of 50 photographs from various parts of the country taken in the 1970s. The images show road damage, construction in progress, traffic violati
- count=8, auctions=1, text=Raymond THIBÉSART (1874–1968) Study of a Standing Male Nude. A pair of drawings on paper in black graphite. Height: 63.5 cm Length: 48 cm Creases, stains, fox
- count=7, auctions=1, text=Raymond THIBÉSART (1874–1968) Study of a Standing Male Nude. Drawing on paper in black graphite. Height: 63.5 cm Length: 48 cm Creases, stains, foxing, and te
- count=6, auctions=1, text=VDL. A collection of 50 photographs of the city of Luxembourg taken in the 1970s. The images depict deteriorating roads, construction in progress, traffic viola

### Text hygiene

| Column | Check | Rows | % of non-empty |
|---|---|---|---|
| `description_fr` | starts with the full title_fr text | 18,805 | 89.9% |
| `description_en` | starts with the full title_en text | 18,970 | 90.7% |
| `title_fr` | HTML entities (e.g. `&amp;`) | 195 | 0.9% |
| `title_fr` | HTML tags | 0 | 0.0% |
| `title_fr` | leading sub-lot numbering ('1 - ...') | 192 | 0.9% |
| `title_en` | HTML entities (e.g. `&amp;`) | 208 | 1.0% |
| `title_en` | HTML tags | 0 | 0.0% |
| `title_en` | leading sub-lot numbering ('1 - ...') | 192 | 0.9% |
| `description_fr` | HTML entities (e.g. `&amp;`) | 258 | 1.2% |
| `description_fr` | HTML tags | 0 | 0.0% |
| `description_fr` | leading sub-lot numbering ('1 - ...') | 0 | 0.0% |
| `description_en` | HTML entities (e.g. `&amp;`) | 316 | 1.5% |
| `description_en` | HTML tags | 0 | 0.0% |
| `description_en` | leading sub-lot numbering ('1 - ...') | 0 | 0.0% |

## 5. Languages

### French / English field coverage

| Table | Field | Rows | Both FR+EN | FR only | EN only | Neither | FR identical to EN |
|---|---|---|---|---|---|---|---|
| lots | title | 20,923 | 20,920 (100.0%) | 0 | 0 | 3 | 1,501 (7.2%) |
| lots | description | 20,923 | 20,920 (100.0%) | 0 | 0 | 3 | 14 (0.1%) |
| lots | category | 20,923 | 20,908 (99.9%) | 0 | 0 | 15 | 1,813 (8.7%) |
| auctions | title | 122 | 96 (78.7%) | 0 | 0 | 26 | 3 (2.5%) |
| auctions | description | 122 | 122 (100.0%) | 0 | 0 | 0 | 9 (7.4%) |

### Detected language of field content

Heuristic function-word detector (`auction_search.text.language`). `unknown` = too short or ambiguous (e.g. an artist's name alone).

| Table.column | Declared | Sampled | Detected languages |
|---|---|---|---|
| `lots.title_fr` | fr | 20,920 | fr: 13,623 (65.1%), unknown: 7,249 (34.7%), en: 33 (0.2%), de: 7 (0.0%), nl: 5 (0.0%), es: 2 (0.0%), it: 1 (0.0%) |
| `lots.title_en` | en | 20,920 | en: 12,751 (61.0%), unknown: 7,949 (38.0%), de: 157 (0.8%), fr: 63 (0.3%) |
| `lots.description_fr` | fr | 20,920 | fr: 18,740 (89.6%), unknown: 1,745 (8.3%), en: 421 (2.0%), nl: 8 (0.0%), de: 4 (0.0%), es: 2 (0.0%) |
| `lots.description_en` | en | 20,920 | en: 18,021 (86.1%), unknown: 2,037 (9.7%), de: 703 (3.4%), nl: 124 (0.6%), fr: 35 (0.2%) |
| `auctions.title_fr` | fr | 96 | unknown: 61 (63.5%), fr: 32 (33.3%), en: 3 (3.1%) |
| `auctions.title_en` | en | 96 | unknown: 58 (60.4%), en: 38 (39.6%) |
| `auctions.description_fr` | fr | 122 | fr: 115 (94.3%), en: 3 (2.5%), de: 2 (1.6%), es: 1 (0.8%), unknown: 1 (0.8%) |
| `auctions.description_en` | en | 122 | en: 108 (88.5%), fr: 7 (5.7%), de: 4 (3.3%), es: 2 (1.6%), unknown: 1 (0.8%) |

Examples where `title_fr` content does not look like `fr`:

- id 2212 → en: Hugh Moss, Victor Graham et Ka Bo Tsang, *A Treasury of Chinese Snuff Bottles : The Mary &amp; George Bloch Collection*, 7 vol. Hong Kong,…
- id 8941 → en: DÖRING, JÖRG (Essen, 1965) : A Woman to Die for
- id 6556 → nl: DINH VAN, Epinglette cœur ajouré en or jaune 750°/°°(18K). Signée. 0.85 g. Longueur: 13.7 mm. Ecrin
- id 10076 → de: J.W. von Goethe, *Die natürliche Tochter* (La fille naturelle), tragédie, première édition, Tübingen 1803
- id 9429 → en: Kitaro «The light of the spirit», REF: 924 163-1, pochette: VG+, disque: VG-, inner sleeve, pressage: Europe 1987

Examples where `title_en` content does not look like `en`:

- id 21063 → fr: Domaine Hubert Lignier, Clos de la Roche Grand Cru, 1991 (1 x 750ml)
- id 11327 → de: Ludwig von Hofmann, Pomeranzenzweig / "Reigen mit zwei Grazien". Wohl um 1900 /1926.
- id 21062 → fr: Domaine Hubert Lignier, Clos de la Roche Grand Cru, 1982 (1 x 750ml)
- id 11683 → de: Paar Tassen mit Untertassen mit Blumenbuketts mit sehr seltener Ausführung der Punkt-Schwerter. Meissen. Wohl um 1730–1740.
- id 8229 → fr: La Nuit Tous les Chats Sont Gris Cellier des Chartreux 2025 Rosé Gard, a 1.5-liter magnum

Examples where `description_fr` content does not look like `fr`:

- id 7024 → en: Pendule de cheminée Louis XVI en marbre blanc et monture en bronze doré et patiné par La Croix A Louis XVI ormolu-mounted patinated bronze…
- id 21063 → en: Domaine Hubert Lignier, Clos de la Roche Grand Cru, 1991 (1 x 750ml) Region: Burgundy Fill Level: excellent Capsule: ok Cork: ok Label: exc…
- id 6918 → en: Paire de jarres d'apothicaire à deux anses en majolique de Montelupo, fin XVIe siècle A pair of Montelupo maiolica two-handled drug jars, l…
- id 21062 → en: Domaine Hubert Lignier, Clos de la Roche Grand Cru, 1982 (1 x 750ml) Region: Burgundy Fill Level: excellent Capsule: ok Cork: ok Label: exc…
- id 2822 → en: Attribué à John Hoppner R.A. (1758-1810) Portrait présumé d'une noble dame à mi-buste huile sur toile oil on canvas 76.6 x 63.7cm (30 3/16…

Examples where `description_en` content does not look like `en`:

- id 11610 → de: Günther Uecker "Feldarbeit – Arbeitsfelder". 1996. Günther Uecker 1930 Wendorf, Mecklenburg – lebt in Düsseldorf / St. Gallen Four collotyp…
- id 17684 → nl: mounted impala head - Aepyceros melampus Opgezette kop van een impala - Aepyceros melampus - hoogte : 73 cm
- id 11205 → de: Ingo Kraft, Komposition. 1991/1992. Ingo Kraft 1949 Siegmar-Schönau – lebt in Dresden Oil on canvas. Signiert und datiert "I.Kraft 91/92" s…
- id 11348 → de: Käthe Kollwitz "Weberzug". 1893–1897. Späterer Abzug von 1931-1941. Käthe Kollwitz 1867 Königsberg – 1945 Moritzburg Buch- und Kunsthandlun…
- id 11327 → de: Ludwig von Hofmann, Pomeranzenzweig / "Reigen mit zwei Grazien". Wohl um 1900 /1926. Ludwig von Hofmann 1861 Darmstadt – 1945 Pillnitz bei…

Examples where `title_fr` content does not look like `fr`:

- id 134 → en: Direct from the Cellar of Domaine Hubert Lignier – Clos de la Roche and Beyond
- id 72 → en: From Antwerp to Bruges, the Collection of a Flemish Connoisseur
- id 76 → en: Old Master and 19th Century Paintings

Examples where `description_fr` content does not look like `fr`:

- id 62 → de: Entdecken Sie den Katalog und die Ergebnisse der Auktion von Ader
- id 91 → de: Entdecken Sie den Katalog und die Ergebnisse der Auktion von Le Brech & Associés
- id 58 → en: Discover the catalog and results of the Lots Road sale
- id 95 → en: Discover the catalog and results of the Pierre Bergé & Associés sale
- id 86 → es: Descubre el catálogo y los resultados de la venta de Leducq Maison de ventes aux enchères

Examples where `description_en` content does not look like `en`:

- id 59 → es: Descubre el catálogo y los resultados de la venta de Mont de piété Bruxelles
- id 96 → fr: Découvrez le catalogue et les résultats de la vente de Daguerre Val de Loire
- id 66 → de: Entdecken Sie den Katalog und die Ergebnisse der Auktion von L'Huillier & Associés
- id 91 → de: Entdecken Sie den Katalog und die Ergebnisse der Auktion von Le Brech & Associés
- id 58 → fr: Découvrez le catalogue et les résultats de la vente de Lots Road

## 6. Source categories

Columns: `category_fr` (fr), `category_en` (en)

Distinct values: fr: 105, en: 105
 — lots with no category: 15 (0.1%)

All category pairs (106; showing 106):

| fr | en | Lots | % of lots |
|---|---|---|---|
| Arts d'Asie | Asian art | 1508 | 7.2% |
| Pièces et billets | Coins and notes | 1384 | 6.6% |
| Tableaux anciens | Old Masters (before 1870) | 1180 | 5.6% |
| Bagues | Rings | 1077 | 5.1% |
| Tableaux modernes | Impressionist and modern paintings | 1006 | 4.8% |
| Colliers, colliers de perles et sautoirs | Necklaces, pearl necklaces and chains | 829 | 4.0% |
| Lithographies | Lithographs | 745 | 3.6% |
| Icônes | Icons | 680 | 3.3% |
| Photographies | Photographs | 640 | 3.1% |
| Cartes postales | Postcards | 544 | 2.6% |
| Vases | Vases | 503 | 2.4% |
| Céramiques | Ceramics | 430 | 2.1% |
| Boucles d'oreilles | Earrings | 400 | 1.9% |
| Armes | Arms | 391 | 1.9% |
| Services de table | Sets of tableware | 387 | 1.8% |
| Aquarelles | Watercolours | 376 | 1.8% |
| Jouets et maquettes | Toys and models | 368 | 1.8% |
| Tapis | Carpets | 366 | 1.7% |
| Dessins | Works on paper | 335 | 1.6% |
| Bracelets | Bracelets | 315 | 1.5% |
| Montres | Wristwatches | 311 | 1.5% |
| Tableaux contemporains | Post-war and contemporary paintings | 310 | 1.5% |
| Broches et épingles | Brooches and pins | 266 | 1.3% |
| Tables | Tables | 264 | 1.3% |
| Bronzes | Bronzes | 246 | 1.2% |
| Religions | Religions | 234 | 1.1% |
| Verreries | Glasses, carafes and liquor cabinets | 222 | 1.1% |
| Bandes dessinées | Strip cartoons | 217 | 1.0% |
| Lampes et lanternes | Lamps and lanterns | 192 | 0.9% |
| Ménagères et Couverts | Cutlery and silverware | 191 | 0.9% |
| Fauteuils | Armchairs | 185 | 0.9% |
| Médaille historique | Histo medals | 181 | 0.9% |
| Vin | Wine and fortified wine | 180 | 0.9% |
| Lustres | Ceiling and suspended lights | 173 | 0.8% |
| Cadres | Antique and modern frames | 162 | 0.8% |
| Accessoires | Belts and accessories | 161 | 0.8% |
| Chandeliers | Chandeliers, candlesticks and candelabra | 160 | 0.8% |
| Livres anciens | Old books | 158 | 0.8% |
| Appliques | Wall lamps | 151 | 0.7% |
| Assiettes et Plats | Plates and Dishes | 148 | 0.7% |
| Voitures, vélos et autres | Cars, bicycles and other | 143 | 0.7% |
| Coffrets et boîtes | Caskets and boxes | 142 | 0.7% |
| Sculptures | Sculptures | 138 | 0.7% |
| Argenterie | Silver | 134 | 0.6% |
| Sacs à main | Handbags | 123 | 0.6% |
| Bois | Wood sculptures | 121 | 0.6% |
| Miroirs | Mirrors | 121 | 0.6% |
| Consoles | Consoles and corner furniture | 117 | 0.6% |
| Bijoux | Jewellery and precious stones | 115 | 0.5% |
| Chaises | Chairs | 108 | 0.5% |
| Musique | Music | 103 | 0.5% |
| Commodes | Commodes | 99 | 0.5% |
| Textile, dentelles, tissu | Textiles, lace and fabrics | 99 | 0.5% |
| Pendules | Clocks and mantel clocks | 97 | 0.5% |
| Affiches | Posters | 86 | 0.4% |
| Livres et Manuscrits | Books & manuscripts | 76 | 0.4% |
| Montres gousset et poche | Fob and pocket watches | 74 | 0.4% |
| Bibliothèques | Bookshelves | 66 | 0.3% |
| Bureaux | Desks | 66 | 0.3% |
| Pierres précieuses | Precious stones | 63 | 0.3% |
| Lampadaire | lampposts | 61 | 0.3% |
| Médaille militaire | Militaria medals | 48 | 0.2% |
| Buffets | Sideboards and credenzas | 47 | 0.2% |
| Livres religieux | Religious books | 47 | 0.2% |
| Tabourets | Stools | 47 | 0.2% |
| Cartes de géographie | Maps | 46 | 0.2% |
| Histoire Naturelle | Natural history | 45 | 0.2% |
| Terres cuites | Terracotta sculptures | 45 | 0.2% |
| Casques et uniformes | Helmets and uniforms | 44 | 0.2% |
| Street Art | Street Art, graffiti | 42 | 0.2% |
| Pierres fines | Semi-precious stones | 41 | 0.2% |
| Plâtres | Plaster sculptures | 40 | 0.2% |
| Vêtements | Clothes | 39 | 0.2% |
| Paravents | Screens | 38 | 0.2% |
| Stylos | Pens, paperweights and inkwells | 38 | 0.2% |
| Archéologie | Archaeology – Antiquity | 37 | 0.2% |
| Marbres | Marble sculptures | 37 | 0.2% |
| Timbres-poste | Stamps | 37 | 0.2% |
| Canapés et banquettes | Sofas and benches | 34 | 0.2% |
| Objets de collection | Collectors' items | 33 | 0.2% |
| Lettres et autographes | Letters and autographs | 32 | 0.2% |
| Bagages et accessoires de mode | Suitcases and trunks | 30 | 0.1% |
| Boutons de manchettes | Cufflinks | 30 | 0.1% |
| Montres et horlogerie | Watches and timepieces | 28 | 0.1% |
| Sport | Sport items | 26 | 0.1% |
| Whisky, rhum et cognac | Whisky, rum and brandy | 26 | 0.1% |
| Art islamique | Islamic art | 23 | 0.1% |
| Tapisseries | Tapestries | 22 | 0.1% |
| Vins et alcools | Wines and spirits | 21 | 0.1% |
| Coffres | Chests | 20 | 0.1% |
| Portefeuilles | Wallets | 19 | 0.1% |
| Armes, militaria, souvenirs historiques | Arms, hunting weapons and military mementoes | 17 | 0.1% |
|  |  | 15 | 0.1% |
| Champagne | Champagne | 14 | 0.1% |
| Lits | Beds | 14 | 0.1% |
| Chaussures | Shoes | 12 | 0.1% |
| Luminaires | Lighting | 11 | 0.1% |
| Arts premiers | Arts of Africa, America and Oceania | 9 | 0.0% |
| Fourrures | Furs | 9 | 0.0% |
| Mode et vintage | Fashion and vintage items | 7 | 0.0% |
| Judaïca | Judaica | 6 | 0.0% |
| Mobilier | Furniture | 6 | 0.0% |
| Tableaux | Paintings | 6 | 0.0% |
| Sieges | Seating | 5 | 0.0% |
| Arts de la table | Tableware | 1 | 0.0% |
| Lingots | Ingots | 1 | 0.0% |

## 7. Collection status and errors

- `lots.details_status`: completed=20,920, failed=2, partial=1
- `auctions.details_status`: completed=122
- `auctions.catalogue_status`: completed=92, partial=30
- `lots.last_error` non-empty: 3
- `auctions.last_error` non-empty: 30

## 8. Query timings (seconds)

| Step | Seconds |
|---|---|
| column_profiles_lots | 1.575 |
| column_profiles_auctions | 0.005 |
| lengths | 0.308 |
| duplicates | 0.515 |
| hygiene | 0.272 |
| language_pairs | 0.192 |
| language_checks | 0.9 |
| categories | 0.079 |
| auctions | 0.019 |
| statuses | 0.006 |
| orphan_lots | 0.002 |
| samples | 0.109 |

