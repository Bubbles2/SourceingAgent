import type { Auction } from './types'

// Fictional placeholder data for the Phase 1 prototype.
export const featuredAuctions: readonly Auction[] = [
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
    catalogueUrl: 'https://example.com/catalogues/vauclair-tableaux-anciens.pdf',
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
    catalogueUrl: 'https://example.com/catalogues/saint-honore-arts-decoratifs.pdf',
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
    catalogueUrl: 'https://example.com/catalogues/chartrons-grands-vins.pdf',
  },
]
