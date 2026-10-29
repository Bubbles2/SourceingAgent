import { describe, expect, it } from 'vitest'
import { parseLotPage } from './lotResponses'
import { formatEstimate, lotDescription, lotName, lotOptionLabel, lotTitle } from './lotText'

describe('lot text', () => {
  it('prefers the English title', () => {
    expect(lotTitle({ lotNumber: '302', title: '302 - Buda sentado de bronce', titleUk: 'Bronze Seated Buddha' })).toBe(
      'Bronze Seated Buddha',
    )
  })

  it('falls back to the published title, without the lot number it starts with', () => {
    expect(lotTitle({ lotNumber: '302', title: '302 - Buda sentado de bronce', titleUk: null })).toBe('Buda sentado de bronce')
    expect(lotTitle({ lotNumber: '7', title: '7 – Montre', titleUk: '  ' })).toBe('Montre')
    expect(lotTitle({ lotNumber: '1', title: '12 - Montre', titleUk: null })).toBe('12 - Montre')
    expect(lotTitle({ lotNumber: null, title: null, titleUk: null })).toBe('Untitled lot')
  })

  it('prefers the English description', () => {
    expect(lotDescription({ description: 'Bronce', descriptionUk: 'Bronze' })).toBe('Bronze')
    expect(lotDescription({ description: 'Bronce', descriptionUk: null })).toBe('Bronce')
    expect(lotDescription({ description: null, descriptionUk: null })).toBeNull()
  })

  it('names lots and labels them for a list of choices', () => {
    expect(lotName('302')).toBe('Lot 302')
    expect(lotName(null)).toBe('Unnumbered lot')
    expect(lotOptionLabel({ id: '2', lotNumber: '302', title: null, titleUk: 'Bronze Seated Buddha' })).toBe('302 · Bronze Seated Buddha')
    expect(lotOptionLabel({ id: '2', lotNumber: '1', title: null, titleUk: 'x'.repeat(200) })).toHaveLength(84)
  })

  it('formats estimates, leaving them out when there are none', () => {
    expect(formatEstimate({ estimateLow: 1500, estimateHigh: 2000, currency: 'EUR' })).toBe('€1,500–€2,000')
    expect(formatEstimate({ estimateLow: 1500, estimateHigh: null, currency: 'EUR' })).toBe('From €1,500')
    expect(formatEstimate({ estimateLow: null, estimateHigh: null, currency: 'EUR' })).toBeNull()
  })
})

describe('lot responses', () => {
  const lot = {
    id: '9',
    auctionId: '2',
    externalId: '35524882',
    lotNumber: '4',
    title: '4 - ROLEX GMT Ref. 1675 circa 1972',
    description: 'ROLEX GMT Ref. 1675 circa 1972',
    category: 'Wristwatches',
    maker: 'ROLEX',
    materials: [],
    estimateLow: '1500.00',
    estimateHigh: null,
    currency: 'EUR',
    imageUrl: 'https://cdn.drouot.com/d/lot/ftall/2462/186586/fc5d',
    sourceUrl: 'https://drouot.com/en/l/35524882',
    titleUk: 'ROLEX GMT Ref. 1675 circa 1972',
    descriptionUk: 'ROLEX GMT Ref. 1675 circa 1972',
    aiCategory: 'Wristwatches',
    aiSummary: null,
    auction: { id: '2', title: 'Online - Watch Collection', startsAt: null, auctionDate: '2026-10-28', location: null },
  }

  it('reads a page of lots with their sale, and estimates as numbers', () => {
    const page = parseLotPage({ lots: [lot], total: 10, limit: 12, offset: 0 })
    expect(page.items[0]).toMatchObject({ id: '9', estimateLow: 1500, estimateHigh: null, auction: { id: '2' } })
  })

  it.each([
    ['an image that is not https', { ...lot, imageUrl: 'http://cdn.drouot.com/a.jpg' }],
    ['a script link', { ...lot, sourceUrl: 'javascript:alert(1)' }],
    ['an estimate that is not a number', { ...lot, estimateLow: 'about 1500' }],
    ['materials that are not a list', { ...lot, materials: 'bronze' }],
  ])('refuses %s', (_case, broken) => {
    expect(() => parseLotPage({ lots: [broken], total: 1, limit: 12, offset: 0 })).toThrow('Something went wrong on our side')
  })
})
