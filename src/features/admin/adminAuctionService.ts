// Sales as administrators manage them (/api/auctions with the administrator's session): every
// status, never cached. After each change the public cache is cleared, so the website shows it at once.
import { ApiError, apiRequest } from '../../services/apiClient'
import { pageOffset, type Page } from '../../services/pagination'
import { clearCachedResponses } from '../../services/responseCache'
import { parseAuctionPage, parseAuctionResponse } from '../auctions/auctionResponses'
import type { Auction, AuctionStatus, AuctionWithCatalogues } from '../auctions/types'

export const adminPageSize = 25
/** The API's largest page */
const maxPageSize = 100

/** The tabs of the auctions page; each shows one status, and published sales are split by date. */
export type AdminAuctionView = 'upcoming' | 'completed' | 'drafts' | 'cancelled'

const viewFilters: Record<AdminAuctionView, Record<string, string>> = {
  upcoming: { status: 'published', period: 'upcoming' },
  completed: { status: 'published', period: 'completed' },
  drafts: { status: 'draft' },
  cancelled: { status: 'cancelled' },
}

/** What the auction form sends: everything but the id and the status, which have their own controls */
export type AuctionFields = Pick<
  Auction,
  'title' | 'category' | 'house' | 'city' | 'saleDate' | 'saleTime' | 'lotCount' | 'viewing' | 'description' | 'image' | 'featured'
>

function auctionsPath(params: Record<string, string | number>): string {
  const search = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  return `/api/auctions?${search.toString()}`
}

function auctionPath(auctionId: string): string {
  return `/api/auctions/${encodeURIComponent(auctionId)}`
}

export function listAdminAuctions({ view, page }: { view: AdminAuctionView; page: number }): Promise<Page<AuctionWithCatalogues>> {
  return apiRequest(
    auctionsPath({ ...viewFilters[view], limit: adminPageSize, offset: pageOffset(page, adminPageSize) }),
  ).then(parseAuctionPage)
}

/** Every sale whatever its status, in date order, for choosing one in a form or filter */
export async function listAllAuctions(): Promise<AuctionWithCatalogues[]> {
  const first = parseAuctionPage(await apiRequest(auctionsPath({ status: 'all', limit: maxPageSize, offset: 0 })))
  const offsets: number[] = []
  for (let offset = maxPageSize; offset < first.total; offset += maxPageSize) {
    offsets.push(offset)
  }
  const rest = await Promise.all(
    offsets.map((offset) => apiRequest(auctionsPath({ status: 'all', limit: maxPageSize, offset })).then(parseAuctionPage)),
  )
  return [first, ...rest].flatMap((page) => page.items)
}

/** A sale in any status, or null when there is none at this id */
export async function getAdminAuction(auctionId: string): Promise<AuctionWithCatalogues | null> {
  try {
    return parseAuctionResponse(await apiRequest(auctionPath(auctionId)))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** New sales start as drafts unless published straight away. Throws ApiError, for the form to show. */
export async function createAuction(
  input: AuctionFields & { id: string; status: Extract<AuctionStatus, 'draft' | 'published'> },
): Promise<AuctionWithCatalogues> {
  const auction = parseAuctionResponse(await apiRequest('/api/auctions', { method: 'POST', body: input }))
  clearCachedResponses()
  return auction
}

export async function updateAuction(auctionId: string, fields: AuctionFields): Promise<AuctionWithCatalogues> {
  const auction = parseAuctionResponse(await apiRequest(auctionPath(auctionId), { method: 'PATCH', body: fields }))
  clearCachedResponses()
  return auction
}

/** Publish, cancel or reinstate a sale. The API refuses moves back to draft. */
export async function changeAuctionStatus(auctionId: string, status: AuctionStatus): Promise<AuctionWithCatalogues> {
  const auction = parseAuctionResponse(await apiRequest(auctionPath(auctionId), { method: 'PATCH', body: { status } }))
  clearCachedResponses()
  return auction
}

/** Only sales without catalogues can be deleted; the API says so otherwise. */
export async function deleteAuction(auctionId: string): Promise<void> {
  await apiRequest(auctionPath(auctionId), { method: 'DELETE' })
  clearCachedResponses()
}

export const adminAuctionViews: readonly { value: AdminAuctionView; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Reads the `view` search param, defaulting to upcoming published sales. */
export function parseAdminAuctionView(value: string | null): AdminAuctionView {
  return adminAuctionViews.find((option) => option.value === value)?.value ?? 'upcoming'
}
