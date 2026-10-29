import type { AuctionSummary } from '../auctions/types'

/** A lot from a sale's catalogue, as the auction monitor collected it */
export type Lot = {
  id: string
  auctionId: string
  externalId: string
  lotNumber: string | null
  /** As published, in the auction house's language */
  title: string | null
  description: string | null
  category: string | null
  maker: string | null
  materials: readonly string[]
  estimateLow: number | null
  estimateHigh: number | null
  /** ISO 4217, e.g. EUR */
  currency: string | null
  imageUrl: string | null
  /** The lot's page on the auction house's website */
  sourceUrl: string | null
  /** English translations, when the monitor has made them */
  titleUk: string | null
  descriptionUk: string | null
  aiCategory: string | null
  aiSummary: string | null
}

export type LotWithAuction = Lot & {
  auction: AuctionSummary
}

/** Just enough to choose a lot from a list */
export type LotSummary = Pick<Lot, 'id' | 'lotNumber' | 'title' | 'titleUk'>
