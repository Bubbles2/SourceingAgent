// Lots as the API returns them, named after the lots table's columns. Collected text is decoded and
// collected links are only passed on when they are safe. The raw collected data and the monitor's
// working columns stay in the database.
import { decodeOptional, safeLink } from '../../lib/collectedData.ts'
import type { LotRecord, LotSummaryRecord, LotWithAuctionRecord } from '../../repositories/lotsRepository.ts'
import { toAuctionSummaryView, type AuctionSummaryView } from '../auctions/auctionView.ts'

export type LotView = {
  id: string
  auctionId: string
  externalId: string
  lotNumber: string | null
  /** As published, in the auction house's language */
  title: string | null
  description: string | null
  category: string | null
  maker: string | null
  materials: string[]
  /** Exact decimal strings, such as "1500.00" */
  estimateLow: string | null
  estimateHigh: string | null
  currency: string | null
  imageUrl: string | null
  sourceUrl: string | null
  /** English translations */
  titleUk: string | null
  descriptionUk: string | null
  aiCategory: string | null
  aiSummary: string | null
}

export type LotWithAuctionView = LotView & { auction: AuctionSummaryView }

/** Just enough to choose a lot from a list */
export type LotSummaryView = Pick<LotView, 'id' | 'lotNumber' | 'title' | 'titleUk'>

export function toLotView(lot: LotRecord): LotView {
  return {
    id: lot.id,
    auctionId: lot.auctionId,
    externalId: lot.externalId,
    lotNumber: lot.lotNumber,
    title: decodeOptional(lot.title),
    description: decodeOptional(lot.description),
    category: decodeOptional(lot.category),
    maker: decodeOptional(lot.maker),
    materials: lot.materials ?? [],
    estimateLow: lot.estimateLow,
    estimateHigh: lot.estimateHigh,
    currency: lot.currency,
    imageUrl: safeLink(lot.imageUrl),
    sourceUrl: safeLink(lot.sourceUrl),
    titleUk: decodeOptional(lot.titleUk),
    descriptionUk: decodeOptional(lot.descriptionUk),
    aiCategory: decodeOptional(lot.aiCategory),
    aiSummary: decodeOptional(lot.aiSummary),
  }
}

export function toLotWithAuctionView({
  auctionTitle,
  auctionStartsAt,
  auctionDate,
  auctionLocation,
  ...lot
}: LotWithAuctionRecord): LotWithAuctionView {
  return {
    ...toLotView(lot),
    auction: toAuctionSummaryView({
      id: lot.auctionId,
      title: auctionTitle,
      startsAt: auctionStartsAt,
      auctionDate,
      location: auctionLocation,
    }),
  }
}

export function toLotSummaryView(lot: LotSummaryRecord): LotSummaryView {
  return { id: lot.id, lotNumber: lot.lotNumber, title: decodeOptional(lot.title), titleUk: decodeOptional(lot.titleUk) }
}
