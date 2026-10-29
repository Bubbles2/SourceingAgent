// Sales as the API returns them, named after the auctions table's columns. Collected text is decoded
// and collected links are only passed on when they are safe.
import { decodeHtmlEntities, decodeOptional, safeLink } from '../../lib/collectedData.ts'
import type { AuctionRecord } from '../../repositories/auctionsRepository.ts'

export type AuctionView = {
  id: string
  externalId: string
  title: string
  /** ISO 8601 */
  startsAt: string | null
  endsAt: string | null
  /** The sale day in Paris, YYYY-MM-DD */
  auctionDate: string | null
  location: string | null
  catalogueUrl: string | null
  sourceUrl: string | null
  status: string | null
  lotCount: number
}

/** A sale as lots and bid requests show it */
export type AuctionSummaryView = Pick<AuctionView, 'id' | 'title' | 'startsAt' | 'auctionDate' | 'location'>

export function toAuctionView(auction: AuctionRecord): AuctionView {
  return {
    id: auction.id,
    externalId: auction.externalId,
    title: decodeHtmlEntities(auction.title),
    startsAt: auction.startsAt?.toISOString() ?? null,
    endsAt: auction.endsAt?.toISOString() ?? null,
    auctionDate: auction.auctionDate,
    location: decodeOptional(auction.location),
    catalogueUrl: safeLink(auction.catalogueUrl),
    sourceUrl: safeLink(auction.sourceUrl),
    status: auction.status,
    lotCount: auction.lotCount,
  }
}

export function toAuctionSummaryView(sale: {
  id: string
  title: string
  startsAt: Date | null
  auctionDate: string | null
  location: string | null
}): AuctionSummaryView {
  return {
    id: sale.id,
    title: decodeHtmlEntities(sale.title),
    startsAt: sale.startsAt?.toISOString() ?? null,
    auctionDate: sale.auctionDate,
    location: decodeOptional(sale.location),
  }
}
