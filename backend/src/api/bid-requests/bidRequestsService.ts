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

/** A customer's own request as the API returns it. maxBidEur is an exact decimal string, e.g. "2500.00". */
export type CustomerBidRequest = {
  id: string
  lotNumber: number
  maxBidEur: string
  instructions: string
  status: BidRequestStatus
  submittedAt: string
  auction: { id: string; title: string; house: string; city: string; saleDate: string; saleTime: string }
  catalogue: { id: string; title: string }
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
    lotNumber: row.lotNumber,
    maxBidEur: row.maxBidEur,
    instructions: row.instructions,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    auction: {
      id: row.auctionSlug,
      title: row.auctionTitle,
      house: row.auctionHouse,
      city: row.auctionCity,
      saleDate: row.saleDate,
      saleTime: row.saleTime,
    },
    catalogue: { id: row.catalogueSlug, title: row.catalogueTitle },
  }
}

function alreadyRequested(lotNumber: number, status: BidRequestStatus): HttpError {
  return new HttpError(
    409,
    'already_requested',
    `You already have a request for lot ${lotNumber} in this catalogue (${statusLabels[status]}). You can follow it under My requests.`,
  )
}

function lotReserved(lotNumber: number): HttpError {
  return new HttpError(
    409,
    'lot_reserved',
    `Lot ${lotNumber} already has an accepted request from another customer, so the agent can't take a second one. Choose another lot.`,
  )
}

export async function listMyBidRequests(customerId: string): Promise<CustomerBidRequest[]> {
  return (await listCustomerBidRequests(customerId)).map(toCustomerBidRequest)
}

export async function createBidRequest(customer: UserRecord, input: CreateBidRequestBody): Promise<CustomerBidRequest> {
  try {
    const created = await withTransaction(async (client) => {
      const target = await findRequestTarget(input.auctionId, input.catalogueId, client)
      if (!target || !target.saleOpen) {
        throw new HttpError(409, 'sale_closed', 'This sale is no longer taking bid requests. Choose another auction.')
      }
      const catalogue = target.catalogue
      if (!catalogue || catalogue.auctionId !== target.auctionId) {
        throw new HttpError(400, 'catalogue_mismatch', 'Choose a catalogue from the selected sale.')
      }
      if (input.lotNumber < catalogue.firstLot || input.lotNumber > catalogue.lastLot) {
        throw new HttpError(
          400,
          'lot_out_of_range',
          `Lot numbers in this catalogue run from ${catalogue.firstLot} to ${catalogue.lastLot}.`,
        )
      }

      const ownStatus = await findOpenRequestStatus(customer.id, catalogue.id, input.lotNumber, client)
      if (ownStatus) {
        throw alreadyRequested(input.lotNumber, ownStatus)
      }
      if (await isLotReserved(catalogue.id, input.lotNumber, client)) {
        throw lotReserved(input.lotNumber)
      }

      const id = await insertBidRequest(
        {
          customerId: customer.id,
          auctionId: target.auctionId,
          catalogueId: catalogue.id,
          lotNumber: input.lotNumber,
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
      throw alreadyRequested(input.lotNumber, 'pending')
    }
    throw error
  }
}
