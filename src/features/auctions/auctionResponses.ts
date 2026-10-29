// Checks auction responses against the API contract (backend src/api/auctions).
import type { Page } from '../../services/pagination'
import {
  contractError,
  integer,
  list,
  nested,
  nullableMatching,
  nullableText,
  record,
  text,
  type Fields,
} from '../../services/responseFields'
import type { Auction, AuctionSummary } from './types'

export const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
/** The API only passes on links to public https:// addresses */
export const httpsPattern = /^https:\/\//

/** An ISO date-time the browser can read */
function nullableDateTime(fields: Fields, key: string): string | null {
  const value = nullableText(fields, key)
  if (value !== null && Number.isNaN(Date.parse(value))) {
    throw contractError()
  }
  return value
}

export function pageOf<Item>(data: unknown, key: string, parseItem: (value: unknown) => Item): Page<Item> {
  const fields = record(data)
  return {
    items: list(fields, key).map(parseItem),
    total: integer(fields, 'total'),
    limit: integer(fields, 'limit'),
    offset: integer(fields, 'offset'),
  }
}

export function parseAuction(value: unknown): Auction {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    externalId: text(fields, 'externalId'),
    title: text(fields, 'title'),
    startsAt: nullableDateTime(fields, 'startsAt'),
    endsAt: nullableDateTime(fields, 'endsAt'),
    auctionDate: nullableMatching(fields, 'auctionDate', isoDatePattern),
    location: nullableText(fields, 'location'),
    catalogueUrl: nullableMatching(fields, 'catalogueUrl', httpsPattern),
    sourceUrl: nullableMatching(fields, 'sourceUrl', httpsPattern),
    status: nullableText(fields, 'status'),
    lotCount: integer(fields, 'lotCount'),
  }
}

export function parseAuctionSummary(value: unknown): AuctionSummary {
  const fields = record(value)
  return {
    id: text(fields, 'id'),
    title: text(fields, 'title'),
    startsAt: nullableDateTime(fields, 'startsAt'),
    auctionDate: nullableMatching(fields, 'auctionDate', isoDatePattern),
    location: nullableText(fields, 'location'),
  }
}

/** { auctions, total, limit, offset } */
export function parseAuctionPage(data: unknown): Page<Auction> {
  return pageOf(data, 'auctions', parseAuction)
}

/** { auction } */
export function parseAuctionResponse(data: unknown): Auction {
  return parseAuction(nested(record(data), 'auction'))
}
