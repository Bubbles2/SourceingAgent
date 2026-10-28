// Checks bid request responses against the API contract, so a mismatch fails here, loudly, rather
// than as a blank cell somewhere in a table.
import { ApiError } from '../../services/apiClient'
import { bidRequestStatuses, type BidRequestStatus, type MyBidRequest, type RequestedLot } from './types'

type Fields = Record<string, unknown>

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null
}

function contractError(): ApiError {
  return new ApiError(500, 'unexpected_response', 'Something went wrong on our side. Please try again.')
}

function text(record: Fields, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw contractError()
  }
  return value
}

function integer(record: Fields, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw contractError()
  }
  return value
}

function nested(record: Fields, key: string): Fields {
  const value = record[key]
  if (!isRecord(value)) {
    throw contractError()
  }
  return value
}

function status(record: Fields): BidRequestStatus {
  const value = record.status
  const match = bidRequestStatuses.find((candidate) => candidate === value)
  if (!match) {
    throw contractError()
  }
  return match
}

/** The API sends amounts as exact decimal strings ("2500.00"); requests are in whole euros. */
function wholeEuros(record: Fields, key: string): number {
  const amount = Number(text(record, key))
  if (!Number.isSafeInteger(amount)) {
    throw contractError()
  }
  return amount
}

function list(data: unknown, key: string): unknown[] {
  const value = isRecord(data) ? data[key] : undefined
  if (!Array.isArray(value)) {
    throw contractError()
  }
  return value
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
    status: status(value),
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
