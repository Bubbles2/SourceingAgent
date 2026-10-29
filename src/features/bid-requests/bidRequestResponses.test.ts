import { describe, expect, it } from 'vitest'
import { parseCreatedBidRequest, parseMyBidRequests, parseRequestedLots } from './bidRequestResponses'

const auction = {
  id: '1',
  title: 'Debaveye Fine Arts & Antiques Auction',
  startsAt: '2026-11-14T13:00:00.000Z',
  auctionDate: '2026-11-14',
  location: null,
}
const lot = { id: '2', lotNumber: '302', title: '302 - Buda sentado de bronce', titleUk: 'Bronze Seated Buddha' }

const apiRequest = {
  id: '1b3f9c1e-0000-4000-8000-000000000001',
  maxBidEur: '2500.00',
  instructions: '',
  status: 'pending',
  submittedAt: '2026-10-28T09:00:00.000Z',
  auction,
  lot,
}

describe('parseMyBidRequests', () => {
  it('reads exact decimal amounts as whole euros, with the sale and lot', () => {
    const [request] = parseMyBidRequests({ requests: [apiRequest] })
    expect(request?.maxBidEur).toBe(2500)
    expect(request?.auction).toEqual(auction)
    expect(request?.lot).toEqual(lot)
    expect(parseCreatedBidRequest({ request: apiRequest }).id).toBe(apiRequest.id)
  })

  it.each([
    ['an unknown status', { ...apiRequest, status: 'approved' }],
    ['an amount with cents', { ...apiRequest, maxBidEur: '2500.50' }],
    ['an amount sent as a number', { ...apiRequest, maxBidEur: 2500 }],
    ['a missing sale', { ...apiRequest, auction: undefined }],
    ['a missing lot', { ...apiRequest, lot: undefined }],
    ['a lot number sent as a number', { ...apiRequest, lot: { ...lot, lotNumber: 302 } }],
  ])('rejects a response with %s', (_case, request) => {
    expect(() => parseMyBidRequests({ requests: [request] })).toThrow(expect.objectContaining({ code: 'unexpected_response' }))
  })

  it('rejects a response without a list', () => {
    expect(() => parseMyBidRequests({ request: apiRequest })).toThrow()
  })
})

describe('parseRequestedLots', () => {
  const requestedLot = { auction, lot, availability: 'reserved' }

  it('reads the public list', () => {
    expect(parseRequestedLots({ lots: [requestedLot] })).toEqual([requestedLot])
  })

  it('drops anything the public list should never carry', () => {
    const [parsed] = parseRequestedLots({ lots: [{ ...requestedLot, customerId: 'secret', maxBidEur: '9999.00' }] })
    expect(parsed).toEqual(requestedLot)
  })

  it('rejects unknown availability values', () => {
    expect(() => parseRequestedLots({ lots: [{ ...requestedLot, availability: 'sold' }] })).toThrow()
  })
})
