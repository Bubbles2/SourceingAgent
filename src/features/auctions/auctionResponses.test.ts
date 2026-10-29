import { describe, expect, it } from 'vitest'
import { parseAuctionPage, parseAuctionResponse } from './auctionResponses'

const auction = {
  id: '1',
  externalId: '186207',
  title: 'Debaveye Fine Arts & Antiques Auction',
  startsAt: '2026-11-14T13:00:00.000Z',
  endsAt: null,
  auctionDate: '2026-11-14',
  location: 'Paris 9e',
  catalogueUrl: 'https://drouot.com/en/v/186207',
  sourceUrl: 'https://drouot.com/fr/v/186207',
  status: null,
  lotCount: 262,
}

describe('auction responses', () => {
  it('reads a page of sales', () => {
    const page = parseAuctionPage({ auctions: [auction], total: 13, limit: 12, offset: 12 })
    expect(page).toEqual({ items: [auction], total: 13, limit: 12, offset: 12 })
  })

  it('accepts sales whose time, place and links are not known yet', () => {
    const announced = { ...auction, startsAt: null, auctionDate: null, location: null, catalogueUrl: null, sourceUrl: null, lotCount: 0 }
    expect(parseAuctionResponse({ auction: announced })).toEqual(announced)
  })

  it('keeps only the fields the site uses', () => {
    const parsed = parseAuctionResponse({ auction: { ...auction, rawData: { name: 'x' } } })
    expect(parsed).not.toHaveProperty('rawData')
  })

  it.each([
    ['a missing title', { ...auction, title: undefined }],
    ['a date in another format', { ...auction, auctionDate: '14/11/2026' }],
    ['a start time that is not a date', { ...auction, startsAt: 'soon' }],
    ['a lot count as text', { ...auction, lotCount: '262' }],
    ['a catalogue link that is not https', { ...auction, catalogueUrl: 'http://drouot.com/en/v/186207' }],
    ['a script link', { ...auction, sourceUrl: 'javascript:alert(1)' }],
  ])('refuses %s', (_case, broken) => {
    expect(() => parseAuctionResponse({ auction: broken })).toThrow('Something went wrong on our side')
  })

  it('refuses a page without its count', () => {
    expect(() => parseAuctionPage({ auctions: [auction] })).toThrow()
  })
})
