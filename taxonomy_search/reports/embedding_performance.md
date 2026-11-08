# Embedding performance (Phase 5)

- Model `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions) on `mps`; loaded in 1.34 s
- Lots seen 20,923; embedded 0; unchanged (skipped) 20,923
- Encoding 0.0 s (0.0 lots/s); whole run 1.21 s
- Table `lot_embeddings` 83.4 MB including indexes (42.5 MB of indexes, HNSW cosine)
- Memory: the model needs ≈ 0.5 GB on disk (Hugging Face cache) and ≈ 1 GB RAM/GPU memory while encoding.
- AI tokens / paid API calls: 0

## English probes (nearest lots by cosine similarity, HNSW index)

| Query | Latency | Top 5 (lot id, similarity, French title) |
|---|---|---|
| pair of women's ankle boots | 67.2 ms | 3323 (0.51) 2 - LOT DE CHAUSSURES DE FEMME comprenant Tods, Salvator Ferragamo, H… · 16160 (0.41) Montre-bracelet Rolex pour femme, Lady-Datejust, référence 69173, 1991 · 3322 (0.39) 1 - LOT DE MODE FEMININE comprenant vestes, pantalons, chemisiers don… · 3321 (0.37) LOT DE MODE FEMININE comprenant : · 13719 (0.37) Deux bracelets en argent dont un serti de cabochons d'ambre. |
| Louis XIV period commode with Boulle marquetry | 26.4 ms | 21601 (0.69) Meuble d'appui Napoléon III de style Louis XVI en marqueterie Boulle,… · 7025 (0.68) Pendule Louis XVI en bronze doré et marbre blanc, début XIXe siècle · 21584 (0.67) Suite de quatre appliques Napoléon III de style Louis XVI en bronze c… · 7015 (0.66) Pendule lyre Louis XVI à mouvement squelette en marbre blanc et bronz… · 21586 (0.66) Paire de bougeoirs Napoléon III de style Louis XV en bronze argenté,… |
| Chinese blue and white porcelain vase | 24.7 ms | 9853 (0.83) Vase décoratif bleu et blanc posé au sol, Chine, fin du XXe siècle. · 17333 (0.82) Plat de service chinois en porcelaine du XVIIIe siècle, décoré en ble… · 17334 (0.82) Plat chinois en porcelaine du XVIIIe siècle, à décor bleu et blanc, p… · 4271 (0.82) Ensemble de céramiques chinoises bleues et blanches. XVIIIe/XIXe sièc… · 1462 (0.82) Petit vase chinois bleu et blanc en pâte molle, dynastie Qing, périod… |
| French eighteenth-century armchair | 19.4 ms | 19405 (0.77) HENIN Ainé - Paris. Epoque 1880-1900 · 6962 (0.74) Fauteuil en bois relaqué blanc par Tilliard, d'époque Louis XV · 19495 (0.74) Chaise à assise basse et tabouret en bois très richement mouluré et s… · 17800 (0.73) Réunion de DEUX FAUTEUILS en noyer mouluré et sculpté à dossier plat… · 3124 (0.72) Fauteuil en bois tourné et sculpté, les accotoirs en forme de crosse. |
| vintage designer handbag | 12.5 ms | 18470 (0.65) LOUIS VUITTON · 18494 (0.64) OSCAR DE LA RENTA · 18536 (0.64) CARTIER · 18390 (0.64) LOUIS VUITTON · 18422 (0.64) CHRISTIAN DIOR |
| diamond ring in white gold | 17.5 ms | 16044 (0.83) Bague en onyx en or jaune avec un diamant en or blanc · 16150 (0.82) Bague avec diamant en or jaune et or blanc 585 · 15959 (0.81) Bague classique en or blanc 585 sertie d'un brillant d'environ 0,25 c… · 15985 (0.81) Élégante bague pour homme en or jaune 14 carats avec un diamant solit… · 15856 (0.79) Bague en or jaune 585, partiellement rhodiée, avec diamants octogonaux |
| landscape oil painting | 24.5 ms | 17221 (0.70) Peinture à l'huile du XIXe siècle sur carton représentant un paysage… · 3057 (0.70) Ecole moderne de paysage. · 17366 (0.68) Paire de peintures à l'huile sur toile belges - vers 1900 · 9599 (0.67) 2 huiles sur toile et une huile sur panneau, 2 natures mortes et un p… · 9793 (0.66) Trois huiles sur toile, comprenant deux paysages champêtres animés de… |
| silver tea set | 13.8 ms | 4655 (0.69) LINO SABATTINI ARGENTERIE SABATTINI années 60. · 7117 (0.67) Service à thé en argent 800°/°°, travail allemand, début XXe siècle · 3506 (0.67) PARTIE DE SERVICE A THE ET A CAFE en Sarreguemines, décor Minton. · 4726 (0.67) AVANT DE DORMIR 1978. · 10188 (0.66) Service à café et à thé, bol, plateau, etc., argenté, à partir de 1920 |
| bronze sculpture of a horse | 17.4 ms | 18214 (0.75) BOUTEILLE À TABAC EN CALCÉDONIE SCULPTÉE REPRÉSENTANT UN « CHEVAL ATT… · 9841 (0.74) Un cheval en terre cuite sellé de la dynastie Tang, Chine, VIIe-IXe s… · 2612 (0.72) SCULPTURE CHINOISE EN JADEITE REPRÉSENTANT UN CHEVAL, DYNASTIE QING,… · 2232 (0.71) Sculpture chinoise en céladon réticulé et jade roux représentant un c… · 16352 (0.71) Figurine chinoise en bois avec un cheval, début du XXe siècle. |
| Persian carpet | 14.1 ms | 10293 (0.71) Grand tapis d'Orient Bakhtiar, Perse, âgé de 40 à 50 ans · 18012 (0.68) TAPIS D'IRAN à motif géométrique dans les teintes beige et verte. 120… · 10299 (0.67) Réplique moderne d'un tapis d'Orient, nouée d'après un modèle antique… · 17751 (0.64) GRAND TAPIS D'IRAN ancien en laine à décor floral géométrique rouge e… · 10298 (0.64) Réplique moderne d'un tapis d'Orient, nouée d'après un modèle antique… |

