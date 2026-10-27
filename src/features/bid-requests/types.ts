import type { AuctionSummary, Catalogue } from '../auctions/types'

export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const

export type BidRequestStatus = (typeof bidRequestStatuses)[number]

/** Full record as the server would store it. Customer and amount fields are private. */
export type BidRequest = {
  id: string
  customerId: string
  auctionId: string
  catalogueId: string
  lotNumber: number
  maxBidEur: number
  instructions: string
  status: BidRequestStatus
  /** ISO date-time */
  submittedAt: string
}

/** What a customer sends when requesting a bid */
export type BidRequestInput = Pick<BidRequest, 'auctionId' | 'catalogueId' | 'lotNumber' | 'maxBidEur' | 'instructions'>

type CatalogueSummary = Pick<Catalogue, 'id' | 'title'>

/** A customer's own request, joined with its sale and catalogue */
export type MyBidRequest = Pick<BidRequest, 'id' | 'lotNumber' | 'maxBidEur' | 'instructions' | 'status' | 'submittedAt'> & {
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
