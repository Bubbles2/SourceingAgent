// Checks bid request responses against the API contract, so a mismatch fails here, loudly, rather
// than as a blank cell somewhere in a table.
import { contractError, isRecord, list, nested, oneOf, record, text, type Fields } from '../../services/responseFields'
import { parseAuctionSummary } from '../auctions/auctionResponses'
import { parseLotSummary } from '../lots/lotResponses'
import { bidRequestStatuses, type MyBidRequest, type RequestedLot, type RequestSaleAndLot } from './types'

/** The API sends amounts as exact decimal strings ("2500.00"); requests are in whole euros. */
export function wholeEuros(record: Fields, key: string): number {
  const amount = Number(text(record, key))
  if (!Number.isSafeInteger(amount)) {
    throw contractError()
  }
  return amount
}

/** The sale and lot every request carries */
export function parseRequestSaleAndLot(fields: Fields): RequestSaleAndLot {
  return { auction: parseAuctionSummary(nested(fields, 'auction')), lot: parseLotSummary(nested(fields, 'lot')) }
}

export function parseMyBidRequest(value: unknown): MyBidRequest {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    maxBidEur: wholeEuros(fields, 'maxBidEur'),
    instructions: text(fields, 'instructions'),
    status: oneOf(fields, 'status', bidRequestStatuses),
    submittedAt: text(fields, 'submittedAt'),
    ...parseRequestSaleAndLot(fields),
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
    const fields = record(value)
    return {
      ...parseRequestSaleAndLot(fields),
      availability: oneOf(fields, 'availability', ['reserved', 'sale-ended'] as const),
    }
  })
}
