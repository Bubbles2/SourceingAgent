"""Word lists used by the rule-based extractors (Phase 3).

These are rules, not taxonomy: they tell the extractors what to skip (quantifiers, stop words,
words that follow "en" but are not materials) and give canonical labels for two small closed
vocabularies (decoration techniques and origin adjectives). Everything the extractors find is still
a *candidate* that needs review. Keys are normalised (lower-case, no accents).
"""

from __future__ import annotations

# Words that start a French title before the object noun: "Paire de", "Deux", "Important", ...
FR_QUANTIFIERS = frozenset(
    "un une des deux trois quatre cinq six sept huit neuf dix douze paire paires ensemble ensembles lot lots "
    "suite suites reunion serie important importante importants importantes rare rares grand grande grands "
    "grandes petit petite petits petites beau bel belle beaux belles tres exceptionnel exceptionnelle "
    "joli jolie ancien ancienne anciens anciennes superbe magnifique fin fine nouveau nouvelle "
    "elegant elegante charmant charmante curieux curieuse precieux precieuse authentique "
    "partie parties element elements fragment fragments morceau morceaux "
    "le la les l d de du".split()
)

FR_STOPWORDS = frozenset(
    "a au aux avec ce ces dans de des du d en et est il ils elle elles l la le les leur leurs mais ne ni "
    "on ou par pas pour qu que qui sa se ses son sous sur un une vers y apres avant entre chez sans "
    "tres plus moins comme dont ont sont etait ainsi aussi alors encore environ probablement peut etre "
    "deja toujours egalement notamment".split()
)

# Words after "style" that describe quality, not a style ("de style raffiné").
NON_STYLES = frozenset(
    "rare raffine raffinee elegant elegante simple sobre typique caracteristique different differente "
    "identique similaire proche original originale classique furniture".split()
)

EN_STOPWORDS = frozenset(
    "a an and are as at be by for from has have in is it its of on or that the their this to was were "
    "with which who into over under approx approximately cm mm g kg ct x".split()
)

# First tokens that are never an object type (layout words, generic nouns, attributions).
NON_OBJECT_HEADS = frozenset(
    "autres autre objets objet collection collections reunion ensemble lot lots divers diverses "
    "important rare ecole attribue attribuee atelier entourage suiveur apres dans style epoque fin debut "
    "milieu siecle vers circa signe signee non sans titre untitled modele n no numero ref reference "
    "provenance bibliographie exposition oeuvre oeuvres photographe vdl gdl travail "
    "aucun aucune sans non avec selon voir vendu vendus vendue vente frais conditions attention "
    # painting and drawing media start many titles ("Huile sur toile") but are techniques
    "huile gouache encre crayon fusain pastel sanguine tempera acrylique technique".split()
)

# Words after "en" that are not materials ("en forme de", "en l'état", "en partie", ...).
NON_MATERIALS = frozenset(
    "forme formes l etat partie parties suite place cours tout toute tous bon bonne tres parfait parfaite "
    "excellent excellente assez mauvais usage vente provenance relief applique applique pied pieds "
    "haut bas avant arriere fond fonds plus outre effet particulier general fait raison deux trois "
    "quatre ce cette ces un une son sa ses leur leurs majorite totalite plein pleine attendant "
    "argentine chine france italie angleterre allemagne japon europe asie afrique amerique "
    "octobre novembre decembre janvier fevrier mars avril mai juin juillet aout septembre "
    # handled by the "placage de X" rule instead
    "placage plaquage marqueterie incrustation incrustations "
    # colours and decoration phrases: "en bleu sous couverte", "en creux", "en réserve", "en camaïeu"
    "bleu rouge vert verte noir noire blanc blanche jaune rose gris grise polychrome camaieu grisaille "
    "couleur couleurs creux boucle boucles reserve reserves application suspension bouquet rapport guise "
    # jewellery setting and cut vocabulary: "en serti clos", "en chute", "taille en cabochon"
    "serti sertis chute cabochon cabochons poire goutte navette brillant pavage pave ligne rang rangs "
    # prepositional phrases: "en tant que", "en vue de", "en cas de", "en dehors", "en face"
    "tant vue cas fonction lien majeure moyenne plusieurs nombre quantite serie series dehors face "
    "bordure periode vigueur memoire hommage".split()
)

# Adjectives that name a variant of a material: "bronze doré" (gilt bronze), "or jaune", "bois noirci",
# "fer forgé", "verre soufflé". Decoration techniques (sculpté, ciselé, émaillé) are deliberately absent.
MATERIAL_MODIFIERS = frozenset(
    "dore doree dores dorees argente argentee argentes argentees patine patinee patines patinees "
    "laque laquee noirci noircie massif massive jaune blanc blanche gris grise rose rouge vert verte "
    "bleu bleue noir noire naturel naturelle forge forgee souffle soufflee vernisse vernissee".split()
)

# Material heads that take a "de X" complement: "bois de rose", "pâte de verre", "terre de pipe".
MATERIAL_COMPOUND_HEADS = frozenset("bois pate terre cristal corne nacre peau fil feuille poudre".split())

# Technique cues → (canonical French label, English label). Matched on normalised token lemmas.
TECHNIQUES: dict[str, tuple[str, str]] = {
    **{w: ("Ciselure", "Chasing") for w in ("cisele", "ciselee", "ciseles", "ciselees", "ciselure")},
    **{w: ("Dorure", "Gilding") for w in ("dorure",)},
    **{w: ("Émaillage", "Enamelling") for w in ("emaille", "emaillee", "emailles", "emaillees")},
    **{w: ("Gravure", "Engraving") for w in ("grave", "gravee", "graves", "gravees")},
    **{w: ("Laque", "Lacquer") for w in ("laque", "laquee", "laques", "laquees")},
    **{w: ("Patine", "Patination") for w in ("patine", "patinee", "patines", "patinees")},
    **{w: ("Repoussé", "Repoussé") for w in ("repousse", "repoussee", "repousses")},
    **{w: ("Ajouré", "Openwork") for w in ("ajoure", "ajouree", "ajoures", "ajourees")},
    **{w: ("Cloisonné", "Cloisonné") for w in ("cloisonne", "cloisonnee", "cloisonnes")},
    **{w: ("Guilloché", "Guilloché") for w in ("guilloche", "guillochee", "guilloches")},
    **{w: ("Broderie", "Embroidery") for w in ("brode", "brodee", "brodes", "brodees", "broderie")},
    **{w: ("Sculpture (taille)", "Carving") for w in ("sculpte", "sculptee", "sculptes", "sculptees")},
    **{w: ("Serti", "Gem setting") for w in ("serti", "sertie", "sertis", "serties", "sertissage")},
    **{w: ("Damasquinage", "Damascening") for w in ("damasquine", "damasquinee", "damasquinage")},
    **{w: ("Filigrane", "Filigree") for w in ("filigrane", "filigranee")},
    # painting and drawing media
    "huile": ("Peinture à l'huile", "Oil painting"),
    "gouache": ("Gouache", "Gouache"),
    "fusain": ("Fusain", "Charcoal"),
    "pastel": ("Pastel", "Pastel"),
    "sanguine": ("Sanguine", "Red chalk"),
    "acrylique": ("Acrylique", "Acrylic"),
}

# Origin cues → (French label of the place, English label). Adjectives in both genders and numbers.
REGIONS: dict[str, tuple[str, str]] = {}
for _forms, _labels in (
    ("francais francaise francaises", ("France", "France")),
    ("chinois chinoise chinoises", ("Chine", "China")),
    ("japonais japonaise japonaises", ("Japon", "Japan")),
    ("italien italienne italiens italiennes", ("Italie", "Italy")),
    ("anglais anglaise anglaises", ("Angleterre", "England")),
    ("allemand allemande allemands allemandes", ("Allemagne", "Germany")),
    ("flamand flamande flamands flamandes", ("Flandres", "Flanders")),
    ("hollandais hollandaise hollandaises neerlandais neerlandaise", ("Pays-Bas", "Netherlands")),
    ("russe russes", ("Russie", "Russia")),
    ("espagnol espagnole espagnols espagnoles", ("Espagne", "Spain")),
    ("venitien venitienne venitiens venitiennes", ("Venise", "Venice")),
    ("autrichien autrichienne autrichiens autrichiennes", ("Autriche", "Austria")),
    ("persan persane persans persanes", ("Perse", "Persia")),
    ("ottoman ottomane ottomans ottomanes", ("Empire ottoman", "Ottoman Empire")),
    ("indien indienne indiens indiennes", ("Inde", "India")),
    ("vietnamien vietnamienne vietnamiens vietnamiennes", ("Vietnam", "Vietnam")),
    ("thai thaie thailandais thailandaise", ("Thaïlande", "Thailand")),
    ("africain africaine africains africaines", ("Afrique", "Africa")),
    ("suedois suedoise", ("Suède", "Sweden")),
    ("danois danoise", ("Danemark", "Denmark")),
    ("belge belges", ("Belgique", "Belgium")),
    ("suisse suisses", ("Suisse", "Switzerland")),
    ("grec grecque grecs grecques", ("Grèce", "Greece")),
    ("egyptien egyptienne", ("Égypte", "Egypt")),
    ("turc turque turcs turques", ("Turquie", "Turkey")),
    ("coreen coreenne", ("Corée", "Korea")),
    ("tibetain tibetaine", ("Tibet", "Tibet")),
):
    for _form in _forms.split():
        REGIONS[_form] = _labels
# Country nouns: same labels as their adjectives ("Chine" → China).
for _noun, _adj in (("france", "francais"), ("chine", "chinois"), ("japon", "japonais"), ("italie", "italien"),
                    ("angleterre", "anglais"), ("allemagne", "allemand"), ("flandres", "flamand"),
                    ("russie", "russe"), ("espagne", "espagnol"), ("venise", "venitien"), ("autriche", "autrichien"),
                    ("perse", "persan"), ("inde", "indien"), ("vietnam", "vietnamien"), ("thailande", "thai"),
                    ("afrique", "africain"), ("suede", "suedois"), ("danemark", "danois"), ("belgique", "belge"),
                    ("grece", "grec"), ("egypte", "egyptien"), ("turquie", "turc"), ("coree", "coreen"),
                    ("tibet", "tibetain")):
    REGIONS[_noun] = REGIONS[_adj]

# Phrases that introduce a maker, mapped to the lot assertion they imply.
ATTRIBUTION_ASSERTIONS = {
    "attribue a": "attributed_to", "attribuee a": "attributed_to", "attribues a": "attributed_to",
    "atelier de": "workshop_of", "entourage de": "circle_of", "cercle de": "circle_of",
    "suiveur de": "follower_of", "ecole de": "follower_of", "d apres": "after",
    "manufacture de": "made_by", "maison": "made_by",
}

# Words that look like names after "par", "signé", etc. but are not makers.
NOT_MAKER_WORDS = frozenset(
    "le la les un une des ce cette en au aux de du et ou sur pour par avec dans signe signee "
    "monogramme monogrammee date datee titre titree numerote numerotee porte cachet tampon "
    "poids total hauteur largeur longueur diametre dimensions taille environ etat "
    "mouvement cadran boitier bracelet fermoir couronne remontoir "
    "france paris londres london nice lyon marseille bordeaux".split()
)
