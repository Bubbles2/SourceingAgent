import { describe, expect, it } from 'vitest'
import type { AuctionWithCatalogues, Catalogue } from '../auctions/types'
import { validateBidRequest, type BidRequestFormValues } from './bidRequestValidation'

function catalogue(id: string, first: number, last: number): Catalogue {
  return {
    id,
    auctionId: 'sale',
    title: `Catalogue ${id}`,
    description: '',
    lots: { first, last },
    pageCount: 10,
    pdfUrl: 'https://example.com/c.pdf',
    cover: null,
  }
}

function auction(id: string, catalogues: Catalogue[]): AuctionWithCatalogues {
  return {
    id,
    title: 'Sale',
    category: 'Fine art',
    house: 'Maison Test',
    city: 'Paris',
    saleDate: '2026-11-14',
    saleTime: '14:00',
    lotCount: 100,
    viewing: { start: '2026-11-12', end: '2026-11-13' },
    description: '',
    image: null,
    featured: false,
    status: 'published',
    catalogues,
  }
}

const auctions = [
  auction('sale', [catalogue('volume-1', 1, 205), catalogue('volume-2', 206, 412)]),
  auction('no-catalogue-yet', []),
]

const valid: BidRequestFormValues = {
  auctionId: 'sale',
  catalogueId: 'volume-2',
  lotNumber: '233',
  maxBid: '2,500',
  instructions: '  Only if unrestored.  ',
  acknowledgedCharges: true,
}

describe('validateBidRequest', () => {
  it('turns a valid form into the request the API expects', () => {
    expect(validateBidRequest(valid, auctions)).toEqual({
      errors: {},
      input: { auctionId: 'sale', catalogueId: 'volume-2', lotNumber: 233, maxBidEur: 2500, instructions: 'Only if unrestored.' },
    })
  })

  it('lists every problem with an empty form', () => {
    const empty: BidRequestFormValues = {
      auctionId: '',
      catalogueId: '',
      lotNumber: '',
      maxBid: '',
      instructions: '',
      acknowledgedCharges: false,
    }
    const { errors, input } = validateBidRequest(empty, auctions)
    expect(input).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['acknowledgedCharges', 'auctionId', 'catalogueId', 'lotNumber', 'maxBid'])
  })

  it('explains when a sale has no catalogue yet', () => {
    expect(validateBidRequest({ ...valid, auctionId: 'no-catalogue-yet' }, auctions).errors.catalogueId).toBe(
      "This sale's catalogue isn't published yet, so requests open once it is.",
    )
  })

  it('refuses sales that are no longer open and catalogues from another sale', () => {
    expect(validateBidRequest({ ...valid, auctionId: 'gone' }, auctions).errors.auctionId).toMatch(/no longer taking/)
    expect(validateBidRequest({ ...valid, catalogueId: 'elsewhere' }, auctions).errors.catalogueId).toBe(
      'Choose a catalogue from the selected sale.',
    )
  })

  it.each([
    ['45a', 'Enter the lot number using digits only, for example 45.'],
    ['12.5', 'Enter the lot number using digits only, for example 45.'],
    ['205', 'Lot numbers in this catalogue run from 206 to 412.'],
    ['413', 'Lot numbers in this catalogue run from 206 to 412.'],
  ])('checks lot %j against the catalogue', (lotNumber, message) => {
    expect(validateBidRequest({ ...valid, lotNumber }, auctions).errors.lotNumber).toBe(message)
  })

  it.each([
    ['2500.50', 'Enter a whole number of euros, for example 2,500.'],
    ['19', 'Enter a maximum bid of at least €20.'],
    ['5,000,001', 'For maximum bids above €5,000,000, please contact the agent directly.'],
  ])('checks the maximum bid %j', (maxBid, message) => {
    expect(validateBidRequest({ ...valid, maxBid }, auctions).errors.maxBid).toBe(message)
  })

  it('limits instructions and needs the charges acknowledged', () => {
    const { errors } = validateBidRequest({ ...valid, instructions: 'x'.repeat(1001), acknowledgedCharges: false }, auctions)
    expect(errors.instructions).toBe('Keep instructions to 1,000 characters or fewer.')
    expect(errors.acknowledgedCharges).toBe('Confirm that you understand what your maximum bid covers.')
  })
})
