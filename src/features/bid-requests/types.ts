import type { AuctionSummary } from '../auctions/types'
import type { LotSummary } from '../lots/types'

export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const

export type BidRequestStatus = (typeof bidRequestStatuses)[number]

/** What a customer sends when requesting a bid. Amounts are whole euros. */
export type BidRequestInput = {
  auctionId: string
  lotId: string
  maxBidEur: number
  instructions: string
  /** The customer confirmed the maximum is the hammer price only; the API refuses requests without it. */
  acknowledgedCharges: true
}

/** The sale and lot a request names */
export type RequestSaleAndLot = {
  auction: AuctionSummary
  lot: LotSummary
}

/** The signed-in customer's own request, with its sale and lot */
export type MyBidRequest = RequestSaleAndLot & {
  id: string
  maxBidEur: number
  instructions: string
  status: BidRequestStatus
  /** ISO date-time */
  submittedAt: string
}

export type LotAvailability = 'reserved' | 'sale-ended'

/** Public view of a lot with an accepted request: no customer, no amount, no request id. */
export type RequestedLot = RequestSaleAndLot & {
  availability: LotAvailability
}
