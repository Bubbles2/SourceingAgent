import { describe, expect, it } from 'vitest'
import { parseAuctionPage, parseAuctionResponse, parseCataloguePage } from './auctionResponses'

const catalogue = {
  id: 'vauclair-tableaux-anciens',
  auctionId: 'vauclair-tableaux-anciens-2026-11',
  title: "Collection d'un amateur parisien",
  description: 'Fully illustrated.',
  lots: { first: 1, last: 212 },
  pageCount: 168,
  pdfUrl: 'https://example.com/catalogue.pdf',
  cover: null,
}

const auction = {
  id: 'vauclair-tableaux-anciens-2026-11',
  title: 'Tableaux anciens & dessins',
  category: 'Fine art',
  house: 'Maison Vauclair',
  city: 'Paris 9e',
  saleDate: '2026-11-14',
  saleTime: '14:00',
  lotCount: 212,
  viewing: { start: '2026-11-12', end: '2026-11-13' },
  description: 'Old master paintings.',
  image: { src: '/images/lot.jpg', alt: 'A pastel portrait' },
  featured: true,
  status: 'published',
  catalogues: [catalogue],
}

describe('auction responses', () => {
  it('reads a page of sales with their catalogues', () => {
    const page = parseAuctionPage({ auctions: [auction], total: 13, limit: 12, offset: 12 })
    expect(page).toEqual({ items: [auction], total: 13, limit: 12, offset: 12 })
  })

  it('accepts sales whose lot count, viewing days and image are not known yet', () => {
    const announced = { ...auction, lotCount: null, viewing: null, image: null, catalogues: [] }
    expect(parseAuctionResponse({ auction: announced })).toEqual(announced)
  })

  it('keeps only the fields the site uses', () => {
    const parsed = parseAuctionResponse({ auction: { ...auction, internalNote: 'x' } })
    expect(parsed).not.toHaveProperty('internalNote')
  })

  it.each([
    ['a missing title', { ...auction, title: undefined }],
    ['a date in another format', { ...auction, saleDate: '14/11/2026' }],
    ['an unknown status', { ...auction, status: 'postponed' }],
    ['a lot count as text', { ...auction, lotCount: '212' }],
    ['a catalogue PDF that is not https', { ...auction, catalogues: [{ ...catalogue, pdfUrl: 'http://example.com/c.pdf' }] }],
    ['a catalogue without lots', { ...auction, catalogues: [{ ...catalogue, lots: null }] }],
  ])('refuses %s', (_case, broken) => {
    expect(() => parseAuctionResponse({ auction: broken })).toThrow('Something went wrong on our side')
  })

  it('refuses a page without its count', () => {
    expect(() => parseAuctionPage({ auctions: [auction] })).toThrow()
  })

  it('reads catalogues with a summary of their sale', () => {
    const summary = { id: auction.id, title: auction.title, house: auction.house, city: auction.city, saleDate: auction.saleDate, saleTime: auction.saleTime }
    const page = parseCataloguePage({ catalogues: [{ ...catalogue, auction: { ...summary, status: 'published' } }], total: 1, limit: 12, offset: 0 })
    expect(page.items).toEqual([{ ...catalogue, auction: summary }])
  })
})
