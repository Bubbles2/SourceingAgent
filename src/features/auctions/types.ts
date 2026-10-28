import type { ImageAsset } from '../../types/media'

/** Visitors and customers only ever see published sales; administrators also see the others. */
export const auctionStatuses = ['draft', 'published', 'cancelled'] as const
export type AuctionStatus = (typeof auctionStatuses)[number]

export type Auction = {
  id: string
  title: string
  category: string
  house: string
  city: string
  /** ISO date (YYYY-MM-DD), Paris time */
  saleDate: string
  /** 24-hour time (HH:mm), Paris time */
  saleTime: string
  /** Unknown until the house publishes its catalogue */
  lotCount: number | null
  /** Public viewing days, when announced */
  viewing: {
    /** ISO date (YYYY-MM-DD) */
    start: string
    /** ISO date (YYYY-MM-DD) */
    end: string
  } | null
  description: string
  /** Lot photo supplied by the house. Without one, cards fall back to the navy date strip (DESIGN.md §7). */
  image: ImageAsset | null
  featured: boolean
  status: AuctionStatus
}

export type AuctionSummary = Pick<Auction, 'id' | 'title' | 'house' | 'city' | 'saleDate' | 'saleTime'>

export type Catalogue = {
  id: string
  auctionId: string
  title: string
  description: string
  lots: { first: number; last: number }
  pageCount: number | null
  /** External PDF published by the auction house */
  pdfUrl: string
  /** Scanned cover. Without one, a typographic cover is drawn from the catalogue details. */
  cover: ImageAsset | null
}

export type AuctionWithCatalogues = Auction & {
  catalogues: readonly Catalogue[]
}

export type CatalogueWithAuction = Catalogue & {
  auction: AuctionSummary
}
