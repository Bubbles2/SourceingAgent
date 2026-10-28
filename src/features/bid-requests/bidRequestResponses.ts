// Checks bid request responses against the API contract, so a mismatch fails here, loudly, rather
// than as a blank cell somewhere in a table.
import { contractError, integer, isRecord, list, nested, oneOf, text, type Fields } from '../../services/responseFields'
import { bidRequestStatuses, type MyBidRequest, type RequestedLot } from './types'

/** The API sends amounts as exact decimal strings ("2500.00"); requests are in whole euros. */
export function wholeEuros(record: Fields, key: string): number {
  const amount = Number(text(record, key))
  if (!Number.isSafeInteger(amount)) {
    throw contractError()
  }
  return amount
}

export function parseMyBidRequest(value: unknown): MyBidRequest {
  if (!isRecord(value)) {
    throw contractError()
  }
  const auction = nested(value, 'auction')
  const catalogue = nested(value, 'catalogue')
  return {
    id: text(value, 'id'),
    lotNumber: integer(value, 'lotNumber'),
    maxBidEur: wholeEuros(value, 'maxBidEur'),
    instructions: text(value, 'instructions'),
    status: oneOf(value, 'status', bidRequestStatuses),
    submittedAt: text(value, 'submittedAt'),
    auction: {
      id: text(auction, 'id'),
      title: text(auction, 'title'),
      house: text(auction, 'house'),
      city: text(auction, 'city'),
      saleDate: text(auction, 'saleDate'),
      saleTime: text(auction, 'saleTime'),
    },
    catalogue: { id: text(catalogue, 'id'), title: text(catalogue, 'title') },
  }
}

export function parseMyBidRequests(data: unknown): MyBidRequest[] {
  return list(data, 'requests').map(parseMyBidRequest)
}

export function parseCreatedBidRequest(data: unknown): MyBidRequest {
  return parseMyBidRequest(isRecord(data) ? data.request : undefined)
}

export function parseRequestedLots(data: unknown): RequestedLot[] {
  return list(data, 'lots').map((value) => {
    if (!isRecord(value)) {
      throw contractError()
    }
    const auction = nested(value, 'auction')
    const catalogue = nested(value, 'catalogue')
    const availability = value.availability
    if (availability !== 'reserved' && availability !== 'sale-ended') {
      throw contractError()
    }
    return {
      auction: {
        id: text(auction, 'id'),
        title: text(auction, 'title'),
        house: text(auction, 'house'),
        saleDate: text(auction, 'saleDate'),
      },
      catalogue: { id: text(catalogue, 'id'), title: text(catalogue, 'title') },
      lotNumber: integer(value, 'lotNumber'),
      availability,
    }
  })
}
