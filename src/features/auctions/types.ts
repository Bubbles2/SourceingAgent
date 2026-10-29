/** A sale, as the auction monitor collected it from the auction house's website */
export type Auction = {
  id: string
  externalId: string
  title: string
  /** ISO date-time; shown in Paris time */
  startsAt: string | null
  endsAt: string | null
  /** ISO date (YYYY-MM-DD), the sale day in Paris */
  auctionDate: string | null
  location: string | null
  /** The sale's catalogue on the auction house's website */
  catalogueUrl: string | null
  /** The page the sale was collected from */
  sourceUrl: string | null
  status: string | null
  lotCount: number
}

/** A sale as lots and bid requests show it */
export type AuctionSummary = Pick<Auction, 'id' | 'title' | 'startsAt' | 'auctionDate' | 'location'>
