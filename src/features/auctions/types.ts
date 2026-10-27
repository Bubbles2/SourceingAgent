import type { ImageAsset } from '../../types/media'

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
  lotCount: number
  viewing: {
    /** ISO date (YYYY-MM-DD) */
    start: string
    /** ISO date (YYYY-MM-DD) */
    end: string
  }
  description: string
  /** Lot photo supplied by the house. Without one, cards fall back to the navy date strip (DESIGN.md §7). */
  image?: ImageAsset
  featured?: boolean
}

export type AuctionSummary = Pick<Auction, 'id' | 'title' | 'house' | 'city' | 'saleDate' | 'saleTime'>

export type Catalogue = {
  id: string
  auctionId: string
  title: string
  description: string
  lots: { first: number; last: number }
  pageCount: number
  /** External PDF published by the auction house */
  pdfUrl: string
  /** Scanned cover. Without one, a typographic cover is drawn from the catalogue details. */
  cover?: ImageAsset
}

export type AuctionWithCatalogues = Auction & {
  catalogues: readonly Catalogue[]
}

export type CatalogueWithAuction = Catalogue & {
  auction: AuctionSummary
}
