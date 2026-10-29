import type { BidRequestStatus, RequestSaleAndLot } from '../bid-requests/types'

/** A bid request as the agent reviews it, with the customer and the amount */
export type ReviewBidRequest = RequestSaleAndLot & {
  id: string
  /** Whole euros */
  maxBidEur: number
  instructions: string
  status: BidRequestStatus
  /** ISO date-time */
  submittedAt: string
  customer: { firstName: string; lastName: string; email: string; companyName: string | null }
  /** Another request already reserves this lot */
  lotHeldByOther: boolean
  /** The changes the API allows right now */
  nextStatuses: readonly BidRequestStatus[]
}

/** One entry in a request's audit trail */
export type StatusChange = {
  /** Null for the request's submission */
  fromStatus: BidRequestStatus | null
  toStatus: BidRequestStatus
  /** ISO date-time */
  changedAt: string
  note: string | null
  changedBy: { name: string; role: string } | null
}

export type ReviewDetail = {
  request: ReviewBidRequest
  history: readonly StatusChange[]
}

/** The review page's tabs */
export type ReviewView = 'pending' | 'accepted' | 'placed' | 'closed' | 'all'
