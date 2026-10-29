import { describe, expect, it } from 'vitest'
import type { Auction } from '../auctions/types'
import type { LotSummary } from '../lots/types'
import { validateBidRequest, type BidRequestFormValues } from './bidRequestValidation'

function auction(id: string, lotCount: number): Auction {
  return {
    id,
    externalId: `external-${id}`,
    title: 'Sale',
    startsAt: '2026-11-14T13:00:00.000Z',
    endsAt: null,
    auctionDate: '2026-11-14',
    location: 'Paris',
    catalogueUrl: null,
    sourceUrl: null,
    status: null,
    lotCount,
  }
}

const auctions = [auction('1', 2), auction('2', 0)]
const lots: LotSummary[] = [
  { id: '10', lotNumber: '301', title: '301 - Paire de haches', titleUk: 'Pair of hatchets' },
  { id: '11', lotNumber: '302', title: '302 - Bouddha', titleUk: 'Bronze Seated Buddha' },
]

const valid: BidRequestFormValues = {
  auctionId: '1',
  lotId: '11',
  maxBid: '2,500',
  instructions: '  Only if unrestored.  ',
  acknowledgedCharges: true,
}

describe('validateBidRequest', () => {
  it('turns a valid form into the request the API expects', () => {
    expect(validateBidRequest(valid, auctions, lots)).toEqual({
      errors: {},
      input: {
        auctionId: '1',
        lotId: '11',
        maxBidEur: 2500,
        instructions: 'Only if unrestored.',
        acknowledgedCharges: true,
      },
    })
  })

  it('lists every problem with an empty form', () => {
    const empty: BidRequestFormValues = { auctionId: '', lotId: '', maxBid: '', instructions: '', acknowledgedCharges: false }
    const { errors, input } = validateBidRequest(empty, auctions, null)
    expect(input).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(['acknowledgedCharges', 'auctionId', 'lotId', 'maxBid'])
  })

  it('explains when a sale has no lots yet', () => {
    expect(validateBidRequest({ ...valid, auctionId: '2', lotId: '' }, auctions, []).errors.lotId).toBe(
      "This sale's lots aren't published yet, so requests open once they are.",
    )
  })

  it('refuses sales that are no longer open and lots from another sale', () => {
    expect(validateBidRequest({ ...valid, auctionId: '99' }, auctions, lots).errors.auctionId).toMatch(/no longer taking/)
    expect(validateBidRequest({ ...valid, lotId: '99' }, auctions, lots).errors.lotId).toBe('Choose a lot from the selected sale.')
  })

  it('leaves the lot to the API while the sale’s lots are still loading', () => {
    expect(validateBidRequest(valid, auctions, null).input).toMatchObject({ lotId: '11' })
  })

  it.each([
    ['2500.50', 'Enter a whole number of euros, for example 2,500.'],
    ['19', 'Enter a maximum bid of at least €20.'],
    ['5,000,001', 'For maximum bids above €5,000,000, please contact the agent directly.'],
  ])('checks the maximum bid %j', (maxBid, message) => {
    expect(validateBidRequest({ ...valid, maxBid }, auctions, lots).errors.maxBid).toBe(message)
  })

  it('limits instructions and needs the charges acknowledged', () => {
    const { errors } = validateBidRequest({ ...valid, instructions: 'x'.repeat(1001), acknowledgedCharges: false }, auctions, lots)
    expect(errors.instructions).toBe('Keep instructions to 1,000 characters or fewer.')
    expect(errors.acknowledgedCharges).toBe('Confirm that you understand what your maximum bid covers.')
  })
})
