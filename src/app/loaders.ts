// Route loaders start data requests as navigation begins and hand the promises to the page,
// which renders skeletons inside <Suspense> until they resolve.
import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import { getAdminSummary } from '../features/admin/adminSummaryService'
import {
  getAuction,
  isAuctionId,
  listAllAuctions,
  listAuctions,
  listAuctionsBetween,
  listFeaturedAuctions,
  listOpenAuctions,
} from '../features/auctions/auctionService'
import { parseSaleStatus } from '../features/auctions/saleStatus'
import { loadSession, sessionCheckFailed } from '../features/auth/sessionStore'
import type { CustomerAccount } from '../features/auth/types'
import { listMyRequests, listRequestedLots } from '../features/bid-requests/bidRequestService'
import { getMonthGridRange, parseMonthKey } from '../features/calendar/calendarDates'
import { listLots, loadAuctionLots } from '../features/lots/lotService'
import { parseReviewView } from '../features/request-review/reviewDecisions'
import { listReviewRequests } from '../features/request-review/reviewService'
import { ApiError } from '../services/apiClient'
import { parsePageNumber } from '../services/pagination'
import { paths, signInPath } from './paths'

/** ?status=upcoming|completed and ?page=, as the auction and lot lists use them */
function readListParams(request: Request) {
  const searchParams = new URL(request.url).searchParams
  return { status: parseSaleStatus(searchParams.get('status')), page: parsePageNumber(searchParams.get('page')) }
}

/** A sale id from the address, or null when it can't be one */
function readAuctionId(value: string | null | undefined): string | null {
  return value && isAuctionId(value) ? value : null
}

export function landingLoader() {
  return { featuredAuctions: listFeaturedAuctions() }
}

export function auctionsLoader({ request }: LoaderFunctionArgs) {
  const { status, page } = readListParams(request)
  return { status, page, auctions: listAuctions({ status, page }) }
}

/** The sale and a page of its lots (?page=), fetched together */
export function auctionDetailsLoader({ request, params }: LoaderFunctionArgs) {
  const auctionId = params.auctionId ?? ''
  const page = parsePageNumber(new URL(request.url).searchParams.get('page'))
  const validId = readAuctionId(auctionId)
  return {
    auctionId,
    page,
    auction: getAuction(auctionId),
    // An id that can't be a sale shows "not found", so there are no lots to fetch.
    lots: validId ? listLots({ auction: validId, page }) : Promise.resolve({ items: [], total: 0, limit: 1, offset: 0 }),
  }
}

/** Lots of upcoming or completed sales, or of one sale (?auction=) */
export function lotsLoader({ request }: LoaderFunctionArgs) {
  const { status, page } = readListParams(request)
  const auctionId = readAuctionId(new URL(request.url).searchParams.get('auction'))
  return {
    status,
    page,
    auctionId,
    auction: auctionId ? getAuction(auctionId) : null,
    lots: auctionId ? listLots({ auction: auctionId, page }) : listLots({ status, page }),
  }
}

export function calendarLoader({ request }: LoaderFunctionArgs) {
  const month = parseMonthKey(new URL(request.url).searchParams.get('month'))
  // Fetch the whole visible grid so sales on the neighbouring months' padding days show too.
  return { month, auctions: listAuctionsBetween(getMonthGridRange(month)) }
}

/**
 * Visitors are sent to sign in, then brought back to the same address (filters included). If the API
 * couldn't be reached, the page shows the "couldn't load" error instead of asking a signed-in customer
 * to sign in again.
 */
async function requireSignIn(request: Request): Promise<CustomerAccount> {
  const account = await loadSession()
  if (!account && sessionCheckFailed()) {
    throw new ApiError(503, 'service_unavailable', 'The service is temporarily unavailable. Please try again in a moment.')
  }
  if (!account) {
    const url = new URL(request.url)
    throw redirect(signInPath(`${url.pathname}${url.search}`))
  }
  return account
}

/**
 * Only upcoming sales can take requests; ?auction= and ?lot= pre-select the form. A pre-selected
 * sale's lots are requested alongside the sales, rather than after them.
 */
export async function requestBidLoader({ request }: LoaderFunctionArgs) {
  await requireSignIn(request)
  const searchParams = new URL(request.url).searchParams
  const auctionId = readAuctionId(searchParams.get('auction'))
  return {
    auctionId,
    lotId: searchParams.get('lot'),
    auctions: listOpenAuctions(),
    lots: auctionId ? loadAuctionLots(auctionId) : null,
  }
}

export function requestedLotsLoader() {
  return { lots: listRequestedLots() }
}

export async function myRequestsLoader({ request }: LoaderFunctionArgs) {
  await requireSignIn(request)
  return { requests: listMyRequests() }
}

/**
 * Administration pages: visitors sign in first, and anyone else gets the "Administrators only" page
 * before anything is fetched. The API refuses them too; this only spares them a failed page.
 */
async function requireAdministrator(request: Request): Promise<void> {
  const account = await requireSignIn(request)
  if (account.role !== 'administrator') {
    throw data(null, { status: 403 })
  }
}

export async function adminDashboardLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  return { summary: getAdminSummary() }
}

/** Tabs by status, and optional filters for one sale (?auction=) and a customer search (?customer=) */
export async function reviewRequestsLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const searchParams = new URL(request.url).searchParams
  const filters = {
    view: parseReviewView(searchParams.get('view')),
    page: parsePageNumber(searchParams.get('page')),
    auction: readAuctionId(searchParams.get('auction')?.trim()) ?? '',
    customer: searchParams.get('customer')?.trim() ?? '',
  }
  return { ...filters, requests: listReviewRequests(filters), auctions: listAllAuctions() }
}

/** The catalogues page became the lots page; old links still arrive. */
export function cataloguesRedirectLoader() {
  return redirect(paths.lots)
}

/** Finds out who is signed in before the first render, so the header never flickers. */
export async function rootLoader() {
  await loadSession()
  return null
}

/** Signed-in customers skip the sign-in and registration pages. */
export async function guestOnlyLoader() {
  if (await loadSession()) {
    throw redirect(paths.account)
  }
  return null
}

export async function accountLoader({ request }: LoaderFunctionArgs) {
  await requireSignIn(request)
  return null
}
