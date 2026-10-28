import type { AuctionSummary, Catalogue } from '../auctions/types'

export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const

export type BidRequestStatus = (typeof bidRequestStatuses)[number]

/** What a customer sends when requesting a bid. Amounts are whole euros. */
export type BidRequestInput = {
  auctionId: string
  catalogueId: string
  lotNumber: number
  maxBidEur: number
  instructions: string
  /** The customer confirmed the maximum is the hammer price only; the API refuses requests without it. */
  acknowledgedCharges: true
}

type CatalogueSummary = Pick<Catalogue, 'id' | 'title'>

/** The signed-in customer's own request, joined with its sale and catalogue */
export type MyBidRequest = {
  id: string
  lotNumber: number
  maxBidEur: number
  instructions: string
  status: BidRequestStatus
  /** ISO date-time */
  submittedAt: string
  auction: AuctionSummary
  catalogue: CatalogueSummary
}

export type LotAvailability = 'reserved' | 'sale-ended'

/** Public view of a lot with an accepted request: no customer, no amount, no request id. */
export type RequestedLot = {
  auction: Pick<AuctionSummary, 'id' | 'title' | 'house' | 'saleDate'>
  catalogue: CatalogueSummary
  lotNumber: number
  availability: LotAvailability
}
