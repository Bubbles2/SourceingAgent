// Bid requests: customers ask the agent to bid on a lot, up to a maximum hammer price. Every rule
// the form shows is checked again here, inside one transaction, and the database's unique indexes
// back up the two "one request per lot" rules.
import pg from 'pg'
import { withTransaction } from '../../db/pool.ts'
import { HttpError } from '../../lib/httpError.ts'
import { logger } from '../../lib/logger.ts'
import {
  findCustomerBidRequest,
  findOpenRequestStatus,
  findRequestTarget,
  insertBidRequest,
  isLotReserved,
  listCustomerBidRequests,
  type BidRequestStatus,
  type CustomerBidRequestRow,
} from '../../repositories/bidRequestsRepository.ts'
import { recordStatusChange } from '../../repositories/requestStatusHistoryRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'
import type { CreateBidRequestBody } from './bidRequestsValidation.ts'
import { lotName, toRequestSaleAndLot, type RequestSaleAndLot } from './requestSaleAndLot.ts'

/** A customer's own request as the API returns it. maxBidEur is an exact decimal string, e.g. "2500.00". */
export type CustomerBidRequest = RequestSaleAndLot & {
  id: string
  maxBidEur: string
  instructions: string
  status: BidRequestStatus
  submittedAt: string
}

const statusLabels: Record<BidRequestStatus, string> = {
  pending: 'Pending review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  placed: 'Bid placed',
  won: 'Won',
  lost: 'Lost',
}

function toCustomerBidRequest(row: CustomerBidRequestRow): CustomerBidRequest {
  return {
    id: row.id,
    maxBidEur: row.maxBidEur,
    instructions: row.instructions,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    ...toRequestSaleAndLot(row),
  }
}

function alreadyRequested(lotNumber: string | null, status: BidRequestStatus): HttpError {
  return new HttpError(
    409,
    'already_requested',
    `You already have a request for ${lotName(lotNumber)} in this sale (${statusLabels[status]}). You can follow it under My requests.`,
  )
}

function lotReserved(lotNumber: string | null): HttpError {
  const name = lotName(lotNumber)
  return new HttpError(
    409,
    'lot_reserved',
    `${name.charAt(0).toUpperCase()}${name.slice(1)} already has an accepted request from another customer, so the agent can't take a second one. Choose another lot.`,
  )
}

export async function listMyBidRequests(customerId: string): Promise<CustomerBidRequest[]> {
  return (await listCustomerBidRequests(customerId)).map(toCustomerBidRequest)
}

export async function createBidRequest(customer: UserRecord, input: CreateBidRequestBody): Promise<CustomerBidRequest> {
  let lotNumber: string | null = null
  try {
    const created = await withTransaction(async (client) => {
      const target = await findRequestTarget(input.auctionId, input.lotId, client)
      if (!target || !target.saleOpen) {
        throw new HttpError(409, 'sale_closed', 'This sale is no longer taking bid requests. Choose another auction.')
      }
      const lot = target.lot
      if (!lot || lot.auctionId !== target.auctionId) {
        throw new HttpError(400, 'lot_mismatch', 'Choose a lot from the selected sale.')
      }
      lotNumber = lot.lotNumber

      const ownStatus = await findOpenRequestStatus(customer.id, lot.id, client)
      if (ownStatus) {
        throw alreadyRequested(lot.lotNumber, ownStatus)
      }
      if (await isLotReserved(lot.id, client)) {
        throw lotReserved(lot.lotNumber)
      }

      const id = await insertBidRequest(
        {
          customerId: customer.id,
          auctionId: target.auctionId,
          lotId: lot.id,
          maxBidEur: input.maxBidEur,
          instructions: input.instructions,
        },
        client,
      )
      await recordStatusChange({ bidRequestId: id, fromStatus: null, toStatus: 'pending', changedBy: customer.id }, client)
      const row = await findCustomerBidRequest(id, customer.id, client)
      if (!row) {
        throw new Error('New bid request could not be read back')
      }
      return toCustomerBidRequest(row)
    })
    logger.info('Bid request submitted', { userId: customer.id, bidRequestId: created.id })
    return created
  } catch (error) {
    // The checks above run first; the unique index only fires if two submissions race.
    if (error instanceof pg.DatabaseError && error.constraint === 'bid_requests_one_open_request_per_customer_lot') {
      throw alreadyRequested(lotNumber, 'pending')
    }
    throw error
  }
}
