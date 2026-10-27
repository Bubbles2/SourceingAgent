// Mock-backed bid request API. submitBidRequest re-runs every check the real server must enforce
// (it does not trust the form), but here it runs in the browser on sample data, so it guarantees
// nothing. Phase 2 moves these rules to the Express API and a database constraint.
import { mockAuctions } from '../../mocks/auctions'
import { mockCatalogues } from '../../mocks/catalogues'
import { mockCurrentCustomer } from '../../mocks/session'
import { mockResponse } from '../../services/mockApi'
import { addBidRequest, clearSubmittedBidRequests, getAllBidRequests } from '../../services/mockBidRequestStore'
import { getSaleStatus } from '../auctions/saleStatus'
import type { Auction, AuctionSummary } from '../auctions/types'
import { checkLotNumber, checkMaxBid } from './bidRequestRules'
import type { BidRequest, BidRequestInput, BidRequestStatus, MyBidRequest, RequestedLot } from './types'

/** Once accepted, a request keeps its lot reserved through to the result. */
const reservingStatuses: ReadonlySet<BidRequestStatus> = new Set(['accepted', 'placed', 'won', 'lost'])
/** A customer can't open a second request on a lot while one of these is live. */
const activeStatuses: ReadonlySet<BidRequestStatus> = new Set(['pending', 'accepted', 'placed'])

const statusLabels: Record<BidRequestStatus, string> = {
  pending: 'Pending review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  placed: 'Bid placed',
  won: 'Won',
  lost: 'Lost',
}

export type SubmitBidRequestError = {
  code: 'sale-closed' | 'catalogue-mismatch' | 'lot-out-of-range' | 'invalid-amount' | 'lot-reserved' | 'already-requested'
  message: string
}

export type SubmitBidRequestResult = { ok: true; request: MyBidRequest } | ({ ok: false } & SubmitBidRequestError)

function summarise({ id, title, house, city, saleDate, saleTime }: Auction): AuctionSummary {
  return { id, title, house, city, saleDate, saleTime }
}

function toMyBidRequest(request: BidRequest): MyBidRequest | null {
  const auction = mockAuctions.find((candidate) => candidate.id === request.auctionId)
  const catalogue = mockCatalogues.find((candidate) => candidate.id === request.catalogueId)
  if (!auction || !catalogue) {
    return null
  }
  const { id, lotNumber, maxBidEur, instructions, status, submittedAt } = request
  return {
    id,
    lotNumber,
    maxBidEur,
    instructions,
    status,
    submittedAt,
    auction: summarise(auction),
    catalogue: { id: catalogue.id, title: catalogue.title },
  }
}

function isSameLot(request: BidRequest, input: Pick<BidRequestInput, 'catalogueId' | 'lotNumber'>): boolean {
  return request.catalogueId === input.catalogueId && request.lotNumber === input.lotNumber
}

/** The signed-in customer's requests, newest first */
export function listMyRequests(): Promise<MyBidRequest[]> {
  const requests = getAllBidRequests()
    .filter((request) => request.customerId === mockCurrentCustomer.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .flatMap((request) => toMyBidRequest(request) ?? [])
  return mockResponse(requests)
}

/**
 * Public list of lots with an accepted request. Builds a new object per lot from auction and
 * catalogue fields only, so customer ids and amounts never leave this function.
 */
export function listRequestedLots(): Promise<RequestedLot[]> {
  const lots = getAllBidRequests()
    .filter((request) => reservingStatuses.has(request.status))
    .flatMap((request): RequestedLot[] => {
      const auction = mockAuctions.find((candidate) => candidate.id === request.auctionId)
      const catalogue = mockCatalogues.find((candidate) => candidate.id === request.catalogueId)
      if (!auction || !catalogue) {
        return []
      }
      return [
        {
          auction: { id: auction.id, title: auction.title, house: auction.house, saleDate: auction.saleDate },
          catalogue: { id: catalogue.id, title: catalogue.title },
          lotNumber: request.lotNumber,
          availability: getSaleStatus(auction.saleDate) === 'upcoming' ? 'reserved' : 'sale-ended',
        },
      ]
    })
    .sort(
      (a, b) =>
        Number(a.availability === 'sale-ended') - Number(b.availability === 'sale-ended') ||
        a.auction.saleDate.localeCompare(b.auction.saleDate) ||
        a.catalogue.title.localeCompare(b.catalogue.title) ||
        a.lotNumber - b.lotNumber,
    )
  return mockResponse(lots)
}

function checkSubmission(input: BidRequestInput, existing: readonly BidRequest[]): SubmitBidRequestError | null {
  const auction = mockAuctions.find((candidate) => candidate.id === input.auctionId)
  if (!auction || getSaleStatus(auction.saleDate) !== 'upcoming') {
    return { code: 'sale-closed', message: 'This sale is no longer taking bid requests.' }
  }

  const catalogue = mockCatalogues.find((candidate) => candidate.id === input.catalogueId)
  if (!catalogue || catalogue.auctionId !== auction.id) {
    return { code: 'catalogue-mismatch', message: 'This catalogue does not belong to the selected sale.' }
  }

  const lotError = checkLotNumber(catalogue, input.lotNumber)
  if (lotError) {
    return { code: 'lot-out-of-range', message: lotError }
  }

  const amountError = checkMaxBid(input.maxBidEur)
  if (amountError) {
    return { code: 'invalid-amount', message: amountError }
  }

  const ownActiveRequest = existing.find(
    (request) =>
      request.customerId === mockCurrentCustomer.id && isSameLot(request, input) && activeStatuses.has(request.status),
  )
  if (ownActiveRequest) {
    return {
      code: 'already-requested',
      message: `You already have a request for lot ${input.lotNumber} in this catalogue (${statusLabels[ownActiveRequest.status]}). You can follow it under My requests.`,
    }
  }

  const reservedByOther = existing.some((request) => isSameLot(request, input) && reservingStatuses.has(request.status))
  if (reservedByOther) {
    return {
      code: 'lot-reserved',
      message: `Lot ${input.lotNumber} already has an accepted request from another customer, so the agent can't take a second one. Choose another lot.`,
    }
  }

  return null
}

export async function submitBidRequest(input: BidRequestInput): Promise<SubmitBidRequestResult> {
  const error = checkSubmission(input, getAllBidRequests())
  if (error) {
    return mockResponse({ ok: false, ...error })
  }

  const request: BidRequest = {
    ...input,
    id: `req-${crypto.randomUUID()}`,
    customerId: mockCurrentCustomer.id,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  }
  addBidRequest(request)

  const created = toMyBidRequest(request)
  return mockResponse(
    created
      ? { ok: true, request: created }
      : { ok: false, code: 'catalogue-mismatch', message: 'This catalogue does not belong to the selected sale.' },
  )
}

/** Prototype only: forget requests submitted in this browser. */
export function resetDemoBidRequests(): void {
  clearSubmittedBidRequests()
}
