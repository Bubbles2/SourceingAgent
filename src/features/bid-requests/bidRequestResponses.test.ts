import { describe, expect, it } from 'vitest'
import { parseCreatedBidRequest, parseMyBidRequests, parseRequestedLots } from './bidRequestResponses'

const apiRequest = {
  id: '1b3f9c1e-0000-4000-8000-000000000001',
  lotNumber: 10,
  maxBidEur: '2500.00',
  instructions: '',
  status: 'pending',
  submittedAt: '2026-10-28T09:00:00.000Z',
  auction: {
    id: 'vauclair-tableaux-anciens-2026-11',
    title: 'Tableaux anciens & dessins',
    house: 'Maison Vauclair',
    city: 'Paris 9e',
    saleDate: '2026-11-14',
    saleTime: '14:00',
  },
  catalogue: { id: 'vauclair-tableaux-anciens', title: 'Collection' },
}

describe('parseMyBidRequests', () => {
  it('reads exact decimal amounts as whole euros', () => {
    const [request] = parseMyBidRequests({ requests: [apiRequest] })
    expect(request?.maxBidEur).toBe(2500)
    expect(request?.auction.saleTime).toBe('14:00')
    expect(parseCreatedBidRequest({ request: apiRequest }).id).toBe(apiRequest.id)
  })

  it.each([
    ['an unknown status', { ...apiRequest, status: 'approved' }],
    ['an amount with cents', { ...apiRequest, maxBidEur: '2500.50' }],
    ['an amount sent as a number', { ...apiRequest, maxBidEur: 2500 }],
    ['a missing sale', { ...apiRequest, auction: undefined }],
    ['a fractional lot number', { ...apiRequest, lotNumber: 10.5 }],
  ])('rejects a response with %s', (_case, request) => {
    expect(() => parseMyBidRequests({ requests: [request] })).toThrow(expect.objectContaining({ code: 'unexpected_response' }))
  })

  it('rejects a response without a list', () => {
    expect(() => parseMyBidRequests({ request: apiRequest })).toThrow()
  })
})

describe('parseRequestedLots', () => {
  const lot = {
    auction: { id: 'a', title: 'Sale', house: 'House', saleDate: '2026-11-14' },
    catalogue: { id: 'c', title: 'Catalogue' },
    lotNumber: 45,
    availability: 'reserved',
  }

  it('reads the public list', () => {
    expect(parseRequestedLots({ lots: [lot] })).toEqual([lot])
  })

  it('drops anything the public list should never carry', () => {
    const [parsed] = parseRequestedLots({ lots: [{ ...lot, customerId: 'secret', maxBidEur: '9999.00' }] })
    expect(parsed).toEqual(lot)
  })

  it('rejects unknown availability values', () => {
    expect(() => parseRequestedLots({ lots: [{ ...lot, availability: 'sold' }] })).toThrow()
  })
})
