# Hybrid search vs keyword search (Phase 6)

- Mode `broad`, taxonomy scope `draft` (unreviewed draft: results are provisional)

| Query | Keyword: raw query | Keyword: content words | Hybrid direct | Hybrid related | Hybrid time | Top hybrid direct matches |
|---|---|---|---|---|---|---|
| Find auctions selling shoes | 0 | 19 ('shoes') | 42 | 39 | 148 ms | 4374 A pair of Chinese silk embroidered 'flowerpo… · 22022 RAFAEL SALEM · 10343 Zaha Hadid for Lacoste, women’s boots, as ne… |
| Find Louis XIV furniture | 0 | 0 ('Louis XIV furniture') | 5 | 1991 | 79 ms | 6934 An important and rare gilt and carved wooden… · 6928 Rare and important commode in ebonized wood,… · 6933 Louis XIV-era “Mazarine” chest of drawers in… |
| Find French eighteenth-century armchairs | 0 | 0 ('French eighteenth-century armchairs') | 23 | 2158 | 65 ms | 6963 Pair of mid-18th-century armchairs in natura… · 6962 White-lacquered wooden armchair by Tillard,… · 9349 18th-century wingback chair. Includes a maho… |
| Find antique furniture with Boulle marquetry | 0 | 0 ('antique furniture Boulle marquetry') | 8 | 2337 | 63 ms | 19419 Low display cabinet in blackened wood, black… · 19483 A counter-height cabinet, curved on all side… · 19485 Coffee table with a rectangular top, made of… |
| Find vintage designer handbags | 0 | 3 ('vintage designer handbags') | 218 | 1668 | 25 ms | 10342 Pearl-knit bag with silver handle, circa 190… · 12175 CHANEL Handbag. Timeless Double Flap Bag. Ca… · 12176 Salvatore FERRAGAMO. "Gancini" handbag. Blac… |
| Find French Baroque cabinets | 0 | 1 ('French Baroque cabinets') | 1 | 173 | 14 ms | 17204 19th Cent. French baroque style Napoleon III… |

Keyword search is PostgreSQL full-text search on the same index (all words required). Counts are not precision: Phase 9 measures relevance (reports/search_evaluation.md).

