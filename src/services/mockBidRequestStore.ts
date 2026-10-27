// Browser-only stand-in for the bid request table. Requests submitted in the prototype are kept in
// localStorage on top of the seeded sample data. Nothing here is shared, validated or secured by a
// server; Phase 2 replaces this module with the API.
import { bidRequestStatuses, type BidRequest } from '../features/bid-requests/types'
import { mockBidRequests } from '../mocks/bidRequests'

const storageKey = 'psa:mock-bid-requests:v1'

// Used when localStorage is unavailable (private mode, blocked storage)
let inMemoryRequests: BidRequest[] = []

function isBidRequest(value: unknown): value is BidRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.customerId === 'string' &&
    typeof record.auctionId === 'string' &&
    typeof record.catalogueId === 'string' &&
    Number.isInteger(record.lotNumber) &&
    Number.isInteger(record.maxBidEur) &&
    typeof record.instructions === 'string' &&
    typeof record.submittedAt === 'string' &&
    bidRequestStatuses.some((status) => status === record.status)
  )
}

function readSubmittedRequests(): BidRequest[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) {
      return inMemoryRequests
    }
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isBidRequest) : []
  } catch {
    return inMemoryRequests
  }
}

function writeSubmittedRequests(requests: BidRequest[]): void {
  inMemoryRequests = requests
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(requests))
  } catch {
    // Storage unavailable: requests stay in memory until the page reloads.
  }
}

export function getAllBidRequests(): BidRequest[] {
  return [...mockBidRequests, ...readSubmittedRequests()]
}

export function addBidRequest(request: BidRequest): void {
  writeSubmittedRequests([...readSubmittedRequests(), request])
}

/** Removes every request submitted in this browser, leaving only the sample data. */
export function clearSubmittedBidRequests(): void {
  inMemoryRequests = []
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Nothing stored.
  }
}
