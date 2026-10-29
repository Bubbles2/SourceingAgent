// Sales from the API (/api/auctions). Responses are reused for a minute (responseCache), so moving
// between pages and calendar months doesn't fetch the same data again.
import { ApiError } from '../../services/apiClient'
import { pageOffset, type Page } from '../../services/pagination'
import { cachedGet } from '../../services/responseCache'
import { parseAuctionPage, parseAuctionResponse } from './auctionResponses'
import type { SaleStatus } from './saleStatus'
import type { Auction } from './types'

export const auctionsPageSize = 12
const featuredCount = 3
/** The API's largest page */
const maxPageSize = 100

/** Sale ids are database keys, so anything but digits can't be one */
export function isAuctionId(value: string): boolean {
  return /^[1-9]\d{0,14}$/.test(value)
}

function auctionsPath(params: Record<string, string | number>): string {
  const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  return `/api/auctions?${search}`
}

/**
 * Every sale matching the filters. One request is enough for a calendar month or the open sales;
 * should there ever be more, the remaining pages are fetched together.
 */
async function listAll(filters: Record<string, string>): Promise<Auction[]> {
  const first = await cachedGet(auctionsPath({ ...filters, limit: maxPageSize, offset: 0 }), parseAuctionPage)
  const offsets: number[] = []
  for (let offset = maxPageSize; offset < first.total; offset += maxPageSize) {
    offsets.push(offset)
  }
  const rest = await Promise.all(
    offsets.map((offset) => cachedGet(auctionsPath({ ...filters, limit: maxPageSize, offset }), parseAuctionPage)),
  )
  return [first, ...rest].flatMap((page) => page.items)
}

/** Upcoming sales soonest first, or completed sales most recent first, a page at a time */
export function listAuctions({ status, page }: { status: SaleStatus; page: number }): Promise<Page<Auction>> {
  return cachedGet(
    auctionsPath({ period: status, limit: auctionsPageSize, offset: pageOffset(page, auctionsPageSize) }),
    parseAuctionPage,
  )
}

/** The next few sales, for the landing page */
export async function listFeaturedAuctions(): Promise<readonly Auction[]> {
  const page = await cachedGet(auctionsPath({ period: 'upcoming', limit: featuredCount }), parseAuctionPage)
  return page.items
}

/** Every upcoming sale, for choosing one in the bid request form */
export function listOpenAuctions(): Promise<Auction[]> {
  return listAll({ period: 'upcoming' })
}

/** Every sale, upcoming and completed, for filtering by sale */
export function listAllAuctions(): Promise<Auction[]> {
  return listAll({})
}

/** Sales between two ISO dates (inclusive), in date and time order */
export function listAuctionsBetween({ from, to }: { from: string; to: string }): Promise<Auction[]> {
  return listAll({ from, to })
}

/** A sale, or null when there is none at this address */
export async function getAuction(auctionId: string): Promise<Auction | null> {
  if (!isAuctionId(auctionId)) {
    return null
  }
  try {
    return await cachedGet(`/api/auctions/${auctionId}`, parseAuctionResponse)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
