// Fictional auction houses, sales and catalogues for development, loaded by npm run db:seed.
// Every sale is published as it is loaded. The PDF links are placeholders on example.com.

export type SampleAuction = {
  id: string
  title: string
  category: string
  house: string
  city: string
  /** YYYY-MM-DD, Paris time */
  saleDate: string
  /** HH:mm, Paris time */
  saleTime: string
  lotCount: number
  viewing: { start: string; end: string }
  description: string
  featured?: boolean
}

export type SampleCatalogue = {
  id: string
  auctionId: string
  title: string
  description: string
  lots: { first: number; last: number }
  pageCount: number
  pdfUrl: string
}

export const sampleAuctions: readonly SampleAuction[] = [
  {
    id: 'vauclair-tableaux-anciens-2026-11',
    title: 'Tableaux anciens & dessins',
    category: 'Fine art',
    house: 'Maison Vauclair',
    city: 'Paris 9e',
    saleDate: '2026-11-14',
    saleTime: '14:00',
    lotCount: 212,
    viewing: { start: '2026-11-12', end: '2026-11-13' },
    description:
      'Old master paintings and drawings from French and Flemish private collections, including a group of eighteenth-century pastel portraits and Italian landscape studies.',
    featured: true,
  },
  {
    id: 'saint-honore-arts-decoratifs-2026-11',
    title: 'Arts décoratifs du XXe siècle',
    category: 'Decorative arts',
    house: 'Hôtel des Ventes Saint-Honoré',
    city: 'Paris 1er',
    saleDate: '2026-11-26',
    saleTime: '14:30',
    lotCount: 148,
    viewing: { start: '2026-11-24', end: '2026-11-25' },
    description:
      'Furniture, ceramics, glass and lighting from 1900 to 1970, from Art Nouveau vases to Art Deco lacquer and post-war French lighting.',
    featured: true,
  },
  {
    id: 'delorme-art-moderne-2026-11',
    title: 'Art moderne & contemporain',
    category: 'Modern art',
    house: 'Maison Delorme',
    city: 'Paris 8e',
    saleDate: '2026-11-26',
    saleTime: '19:00',
    lotCount: 134,
    viewing: { start: '2026-11-24', end: '2026-11-26' },
    description:
      'Paintings, works on paper and sculpture from the École de Paris to the present day, offered in an evening sale.',
  },
  {
    id: 'chartrons-grands-vins-2026-12',
    title: 'Grands vins & spiritueux',
    category: 'Wine & spirits',
    house: 'Enchères des Chartrons',
    city: 'Bordeaux',
    saleDate: '2026-12-05',
    saleTime: '10:30',
    lotCount: 320,
    viewing: { start: '2026-12-03', end: '2026-12-04' },
    description:
      'Bordeaux and Burgundy from a single Médoc cellar, alongside vintage Cognac and Armagnac. Most lots are offered in original wooden cases.',
    featured: true,
  },
  {
    id: 'delorme-bijoux-montres-2026-12',
    title: 'Bijoux & montres',
    category: 'Jewellery & watches',
    house: 'Maison Delorme',
    city: 'Paris 8e',
    saleDate: '2026-12-10',
    saleTime: '15:00',
    lotCount: 186,
    viewing: { start: '2026-12-08', end: '2026-12-09' },
    description:
      "Signed jewellery from the 1920s to today and a selection of collectors' wristwatches, each with a gemmological or service report where available.",
  },
  {
    id: 'bastille-affiches-2026-12',
    title: 'Affiches & arts graphiques',
    category: 'Posters & prints',
    house: 'Bastille Enchères',
    city: 'Paris 11e',
    saleDate: '2026-12-10',
    saleTime: '11:00',
    lotCount: 210,
    viewing: { start: '2026-12-08', end: '2026-12-09' },
    description:
      'Original travel, exhibition and advertising posters from the Belle Époque to the 1960s, most linen-backed.',
  },
  {
    id: 'marchal-livres-manuscrits-2026-12',
    title: 'Livres anciens & manuscrits',
    category: 'Books & manuscripts',
    house: 'Étude Marchal',
    city: 'Paris 6e',
    saleDate: '2026-12-16',
    saleTime: '11:00',
    lotCount: 412,
    viewing: { start: '2026-12-14', end: '2026-12-15' },
    description:
      'A two-volume sale of early printed books, illustrated travel accounts, literary manuscripts and autograph letters.',
  },
  {
    id: 'bastille-design-2027-01',
    title: 'Design & mobilier 1940–1980',
    category: 'Design',
    house: 'Bastille Enchères',
    city: 'Paris 11e',
    saleDate: '2027-01-21',
    saleTime: '18:00',
    lotCount: 164,
    viewing: { start: '2027-01-18', end: '2027-01-20' },
    description:
      "French and Scandinavian post-war furniture, lighting and ceramics, with several pieces from a single architect's apartment.",
  },
  {
    id: 'rhone-saone-arts-asie-2027-01',
    title: "Arts d'Asie",
    category: 'Asian art',
    house: 'Enchères Rhône-Saône',
    city: 'Lyon',
    saleDate: '2027-01-29',
    saleTime: '14:00',
    lotCount: 238,
    viewing: { start: '2027-01-27', end: '2027-01-28' },
    description:
      'Chinese porcelain, Japanese prints and Himalayan bronzes from collections assembled in Lyon over the last century. The catalogue will be published three weeks before the sale.',
  },
  {
    id: 'vauclair-photographies-2026-10',
    title: 'Photographies',
    category: 'Photography',
    house: 'Maison Vauclair',
    city: 'Paris 9e',
    saleDate: '2026-10-15',
    saleTime: '19:00',
    lotCount: 120,
    viewing: { start: '2026-10-13', end: '2026-10-14' },
    description:
      'Vintage and later prints by French humanist photographers, with a section of contemporary landscape photography.',
  },
  {
    id: 'saint-honore-argenterie-2026-10',
    title: 'Argenterie & objets de vitrine',
    category: 'Silver & objets',
    house: 'Hôtel des Ventes Saint-Honoré',
    city: 'Paris 1er',
    saleDate: '2026-10-02',
    saleTime: '14:00',
    lotCount: 198,
    viewing: { start: '2026-09-30', end: '2026-10-01' },
    description:
      'French silver from the eighteenth and nineteenth centuries, snuff boxes, miniatures and other small objects of vertu.',
  },
  {
    id: 'delorme-mode-maroquinerie-2026-09',
    title: 'Mode & maroquinerie',
    category: 'Fashion & accessories',
    house: 'Maison Delorme',
    city: 'Paris 8e',
    saleDate: '2026-09-24',
    saleTime: '14:30',
    lotCount: 265,
    viewing: { start: '2026-09-22', end: '2026-09-23' },
    description:
      'Couture, vintage handbags and luggage from Parisian maisons, together with silk scarves and costume jewellery.',
  },
]

export const sampleCatalogues: readonly SampleCatalogue[] = [
  {
    id: 'vauclair-tableaux-anciens',
    auctionId: 'vauclair-tableaux-anciens-2026-11',
    title: "Collection d'un amateur parisien et à divers",
    description: 'Fully illustrated catalogue with dimensions, provenance and condition notes for every lot.',
    lots: { first: 1, last: 212 },
    pageCount: 168,
    pdfUrl: 'https://example.com/catalogues/vauclair-tableaux-anciens.pdf',
  },
  {
    id: 'saint-honore-arts-decoratifs',
    auctionId: 'saint-honore-arts-decoratifs-2026-11',
    title: 'Art Nouveau, Art Déco & Modernisme',
    description: "Illustrated catalogue with makers' marks, literature references and condition notes.",
    lots: { first: 1, last: 148 },
    pageCount: 124,
    pdfUrl: 'https://example.com/catalogues/saint-honore-arts-decoratifs.pdf',
  },
  {
    id: 'delorme-art-moderne',
    auctionId: 'delorme-art-moderne-2026-11',
    title: 'Art moderne & contemporain — vente du soir',
    description: 'Illustrated catalogue with signatures, dimensions, exhibition history and literature.',
    lots: { first: 1, last: 134 },
    pageCount: 148,
    pdfUrl: 'https://example.com/catalogues/delorme-art-moderne.pdf',
  },
  {
    id: 'chartrons-grands-vins',
    auctionId: 'chartrons-grands-vins-2026-12',
    title: "Cave d'un château du Médoc et à divers",
    description: 'Lot-by-lot listing with vintages, bottle formats, fill levels and storage history.',
    lots: { first: 1, last: 320 },
    pageCount: 88,
    pdfUrl: 'https://example.com/catalogues/chartrons-grands-vins.pdf',
  },
  {
    id: 'delorme-bijoux-montres',
    auctionId: 'delorme-bijoux-montres-2026-12',
    title: 'Bijoux signés & montres de collection',
    description: 'Illustrated catalogue with stone weights, hallmarks and movement details.',
    lots: { first: 1, last: 186 },
    pageCount: 132,
    pdfUrl: 'https://example.com/catalogues/delorme-bijoux-montres.pdf',
  },
  {
    id: 'bastille-affiches',
    auctionId: 'bastille-affiches-2026-12',
    title: 'Affiches originales 1890–1965',
    description: 'Poster dimensions, printers, backing and condition for every lot, illustrated in colour.',
    lots: { first: 1, last: 210 },
    pageCount: 112,
    pdfUrl: 'https://example.com/catalogues/bastille-affiches.pdf',
  },
  {
    id: 'marchal-livres-volume-1',
    auctionId: 'marchal-livres-manuscrits-2026-12',
    title: 'Volume I — Livres imprimés, XVe–XVIIIe siècles',
    description: 'Early printed books, fine bindings and illustrated travel accounts, with full collations.',
    lots: { first: 1, last: 205 },
    pageCount: 196,
    pdfUrl: 'https://example.com/catalogues/marchal-livres-volume-1.pdf',
  },
  {
    id: 'marchal-livres-volume-2',
    auctionId: 'marchal-livres-manuscrits-2026-12',
    title: 'Volume II — Manuscrits & autographes',
    description: 'Literary manuscripts, autograph letters and historical documents, with transcriptions of key passages.',
    lots: { first: 206, last: 412 },
    pageCount: 184,
    pdfUrl: 'https://example.com/catalogues/marchal-livres-volume-2.pdf',
  },
  {
    id: 'bastille-design',
    auctionId: 'bastille-design-2027-01',
    title: 'Design français & scandinave 1940–1980',
    description: 'Illustrated catalogue with designers, manufacturers, dimensions and condition notes.',
    lots: { first: 1, last: 164 },
    pageCount: 140,
    pdfUrl: 'https://example.com/catalogues/bastille-design.pdf',
  },
  {
    id: 'vauclair-photographies',
    auctionId: 'vauclair-photographies-2026-10',
    title: 'Photographies humanistes & contemporaines',
    description: 'Prints with dates, dimensions, printing details and provenance.',
    lots: { first: 1, last: 120 },
    pageCount: 104,
    pdfUrl: 'https://example.com/catalogues/vauclair-photographies.pdf',
  },
  {
    id: 'saint-honore-argenterie',
    auctionId: 'saint-honore-argenterie-2026-10',
    title: 'Argenterie française & objets de vertu',
    description: 'Hallmarks, weights and provenance for each lot, illustrated throughout.',
    lots: { first: 1, last: 198 },
    pageCount: 152,
    pdfUrl: 'https://example.com/catalogues/saint-honore-argenterie.pdf',
  },
  {
    id: 'delorme-mode-maroquinerie',
    auctionId: 'delorme-mode-maroquinerie-2026-09',
    title: 'Mode, maroquinerie & accessoires',
    description: 'Illustrated catalogue with sizes, materials and condition notes.',
    lots: { first: 1, last: 265 },
    pageCount: 176,
    pdfUrl: 'https://example.com/catalogues/delorme-mode-maroquinerie.pdf',
  },
]
