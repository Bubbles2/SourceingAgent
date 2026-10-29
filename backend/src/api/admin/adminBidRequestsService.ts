// The agent's review of bid requests: accept or reject new requests, then record the bid and its
// result. Each change locks the request, checks it against the status the administrator saw and the
// allowed next steps, and is written to the append-only audit trail in the same transaction. The
// database's unique index guarantees at most one request reserves a lot, even when two acceptances race.
import { withTransaction } from '../../db/pool.ts'
import { isUniqueViolation } from '../../lib/databaseErrors.ts'
import { HttpError } from '../../lib/httpError.ts'
import { logger } from '../../lib/logger.ts'
import {
  findReviewBidRequest,
  listReviewBidRequests,
  lockBidRequest,
  setBidRequestStatus,
  type BidRequestStatus,
  type ReviewBidRequestRow,
} from '../../repositories/bidRequestsRepository.ts'
import { listStatusChanges, recordStatusChange, type StatusChangeRow } from '../../repositories/requestStatusHistoryRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'
import { toRequestSaleAndLot, type RequestSaleAndLot } from '../bid-requests/requestSaleAndLot.ts'
import type { ListBidRequestsQuery, StatusChangeBody } from './adminValidation.ts'

/** What can follow each status. Rejected, cancelled, won and lost are final. */
export const statusTransitions: Record<BidRequestStatus, readonly BidRequestStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['placed', 'cancelled'],
  placed: ['won', 'lost'],
  rejected: [],
  cancelled: [],
  won: [],
  lost: [],
}

const statusLabels: Record<BidRequestStatus, string> = {
  pending: 'pending review',
  accepted: 'accepted',
  rejected: 'rejected',
  cancelled: 'cancelled',
  placed: 'bid placed',
  won: 'won',
  lost: 'lost',
}

/** A request with everything the agent needs to decide on it. maxBidEur is an exact decimal string. */
export type ReviewBidRequest = RequestSaleAndLot & {
  id: string
  maxBidEur: string
  instructions: string
  status: BidRequestStatus
  submittedAt: string
  updatedAt: string
  customer: { id: string; firstName: string; lastName: string; email: string; companyName: string | null; countryCode: string }
  /** Another request already reserves this lot */
  lotHeldByOther: boolean
  /** The changes that can be made now */
  nextStatuses: BidRequestStatus[]
}

export type StatusChange = {
  fromStatus: BidRequestStatus | null
  toStatus: BidRequestStatus
  changedAt: string
  note: string | null
  changedBy: { name: string; role: string } | null
}

export type ReviewPage = {
  requests: ReviewBidRequest[]
  total: number
  limit: number
  offset: number
}

const requestNotFound = new HttpError(404, 'bid_request_not_found', 'No bid request was found with this id.')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const lotReserved = new HttpError(
  409,
  'lot_reserved',
  'Another request already reserves this lot, so this one cannot be accepted. Reject it, or cancel the other request first.',
)

/** The next steps that make sense right now, besides being allowed in principle */
function availableStatuses(row: ReviewBidRequestRow): BidRequestStatus[] {
  return statusTransitions[row.status].filter((status) => {
    if (status === 'accepted') {
      return row.saleOpen && !row.lotHeldByOther
    }
    if (status === 'won' || status === 'lost') {
      return row.saleStarted
    }
    return true
  })
}

function toReviewBidRequest(row: ReviewBidRequestRow): ReviewBidRequest {
  return {
    id: row.id,
    maxBidEur: row.maxBidEur,
    instructions: row.instructions,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...toRequestSaleAndLot(row),
    customer: {
      id: row.customerId,
      firstName: row.customerFirstName,
      lastName: row.customerLastName,
      email: row.customerEmail,
      companyName: row.customerCompany,
      countryCode: row.customerCountry,
    },
    lotHeldByOther: row.lotHeldByOther,
    nextStatuses: availableStatuses(row),
  }
}

function toStatusChange(row: StatusChangeRow): StatusChange {
  return {
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedAt: row.changedAt.toISOString(),
    note: row.note,
    changedBy:
      row.changedByFirstName && row.changedByLastName && row.changedByRole
        ? { name: `${row.changedByFirstName} ${row.changedByLastName}`, role: row.changedByRole }
        : null,
  }
}

/** Refuses a change the request's current state doesn't allow. */
function checkChange(current: ReviewBidRequestRow, { from, to }: StatusChangeBody): void {
  if (current.status !== from) {
    throw new HttpError(
      409,
      'status_changed',
      `This request is now ${statusLabels[current.status]}, so it was left unchanged. Review it again before deciding.`,
    )
  }
  if (!statusTransitions[from].includes(to)) {
    throw new HttpError(409, 'invalid_status_change', `A request that is ${statusLabels[from]} can't be marked ${statusLabels[to]}.`)
  }
  if (to === 'accepted' && !current.saleOpen) {
    throw new HttpError(409, 'sale_closed', 'This sale is over, so the request cannot be accepted.')
  }
  if (to === 'accepted' && current.lotHeldByOther) {
    throw lotReserved
  }
  if ((to === 'won' || to === 'lost') && !current.saleStarted) {
    throw new HttpError(409, 'sale_not_started', "The sale hasn't started yet, so there is no result to record.")
  }
}

export async function getReviewPage({ status, auction, customer, limit, offset }: ListBidRequestsQuery): Promise<ReviewPage> {
  const { requests, total } = await listReviewBidRequests({ statuses: status, auctionId: auction, customer }, { limit, offset })
  return { requests: requests.map(toReviewBidRequest), total, limit, offset }
}

export async function getReviewRequest(id: string): Promise<{ request: ReviewBidRequest; history: StatusChange[] }> {
  if (!uuidPattern.test(id)) {
    throw requestNotFound
  }
  return withTransaction(async (client) => {
    const row = await findReviewBidRequest(id, client)
    if (!row) {
      throw requestNotFound
    }
    const history = await listStatusChanges(id, client)
    return { request: toReviewBidRequest(row), history: history.map(toStatusChange) }
  })
}

export async function changeStatus(id: string, change: StatusChangeBody, administrator: UserRecord): Promise<ReviewBidRequest> {
  if (!uuidPattern.test(id)) {
    throw requestNotFound
  }
  try {
    const updated = await withTransaction(async (client) => {
      if (!(await lockBidRequest(id, client))) {
        throw requestNotFound
      }
      // Read after locking, so the checks see any change that was waiting ahead of this one.
      const current = await findReviewBidRequest(id, client)
      if (!current) {
        throw requestNotFound
      }
      checkChange(current, change)
      await setBidRequestStatus(id, change.to, client)
      await recordStatusChange(
        { bidRequestId: id, fromStatus: change.from, toStatus: change.to, changedBy: administrator.id, note: change.note || undefined },
        client,
      )
      const row = await findReviewBidRequest(id, client)
      if (!row) {
        throw new Error('Bid request could not be read back after its status changed')
      }
      return toReviewBidRequest(row)
    })
    logger.info('Bid request status changed', { userId: administrator.id, bidRequestId: id, from: change.from, to: change.to })
    return updated
  } catch (error) {
    // Two acceptances for the same lot raced past the check above; the unique index refused the second.
    if (isUniqueViolation(error, 'bid_requests_one_reserving_request_per_lot')) {
      throw lotReserved
    }
    throw error
  }
}
