// Lots from the API (/api/lots and /api/auctions/:id/lots), reused for a minute (responseCache).
import { ApiError } from '../../services/apiClient'
import { pageOffset, type Page } from '../../services/pagination'
import { cachedGet } from '../../services/responseCache'
import type { SaleStatus } from '../auctions/saleStatus'
import { parseLotPage, parseLotSummaries } from './lotResponses'
import type { LotSummary, LotWithAuction } from './types'

const lotsPageSize = 12

/** One sale's lots in catalogue order, or lots of upcoming or completed sales, a page at a time */
export function listLots({ auction, status, page }: { auction?: string; status?: SaleStatus; page: number }): Promise<Page<LotWithAuction>> {
  const search = new URLSearchParams()
  if (auction) {
    search.set('auction', auction)
  }
  if (status) {
    search.set('period', status)
  }
  search.set('limit', String(lotsPageSize))
  search.set('offset', String(pageOffset(page, lotsPageSize)))
  return cachedGet(`/api/lots?${search}`, parseLotPage)
}

export type AuctionLotsResult = { ok: true; lots: readonly LotSummary[] } | { ok: false; message: string }

/**
 * Every lot of a sale, for choosing one in the bid request form. Never rejects, so the form can say
 * what went wrong beside the lot list instead of the whole page showing its error screen.
 */
export async function loadAuctionLots(auctionId: string): Promise<AuctionLotsResult> {
  try {
    const lots = await cachedGet(`/api/auctions/${encodeURIComponent(auctionId)}/lots`, parseLotSummaries)
    return { ok: true, lots }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error
    }
    return { ok: false, message: error.message }
  }
}
