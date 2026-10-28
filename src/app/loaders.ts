// Route loaders start data requests as navigation begins and hand the promises to the page,
// which renders skeletons inside <Suspense> until they resolve.
import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import { getAdminAuction, listAdminAuctions, listAllAuctions, parseAdminAuctionView } from '../features/admin/adminAuctionService'
import { getAdminCatalogue, listAdminCatalogues } from '../features/admin/adminCatalogueService'
import { getAdminSummary } from '../features/admin/adminSummaryService'
import { isIsoDate } from '../features/admin/auctionFormRules'
import {
  getAuction,
  listAuctions,
  listAuctionsBetween,
  listFeaturedAuctions,
  listOpenAuctions,
} from '../features/auctions/auctionService'
import { parseSaleStatus } from '../features/auctions/saleStatus'
import { loadSession } from '../features/auth/sessionStore'
import type { CustomerAccount } from '../features/auth/types'
import { listMyRequests, listRequestedLots } from '../features/bid-requests/bidRequestService'
import { getMonthGridRange, parseMonthKey } from '../features/calendar/calendarDates'
import { listCatalogues } from '../features/catalogues/catalogueService'
import { parseReviewView } from '../features/request-review/reviewDecisions'
import { listReviewRequests } from '../features/request-review/reviewService'
import { parsePageNumber } from '../services/pagination'
import { paths, signInPath } from './paths'

/** ?status=upcoming|completed and ?page=, as the auction and catalogue lists use them */
function readListParams(request: Request) {
  const searchParams = new URL(request.url).searchParams
  return { status: parseSaleStatus(searchParams.get('status')), page: parsePageNumber(searchParams.get('page')) }
}

export function landingLoader() {
  return { featuredAuctions: listFeaturedAuctions() }
}

export function auctionsLoader({ request }: LoaderFunctionArgs) {
  const { status, page } = readListParams(request)
  return { status, page, auctions: listAuctions({ status, page }) }
}

export function auctionDetailsLoader({ params }: LoaderFunctionArgs) {
  const auctionId = params.auctionId ?? ''
  return { auctionId, auction: getAuction(auctionId) }
}

export function calendarLoader({ request }: LoaderFunctionArgs) {
  const month = parseMonthKey(new URL(request.url).searchParams.get('month'))
  // Fetch the whole visible grid so sales on the neighbouring months' padding days show too.
  return { month, auctions: listAuctionsBetween(getMonthGridRange(month)) }
}

/** Visitors are sent to sign in, then brought back to the same address (filters included). */
async function requireSignIn(request: Request): Promise<CustomerAccount> {
  const account = await loadSession()
  if (!account) {
    const url = new URL(request.url)
    throw redirect(signInPath(`${url.pathname}${url.search}`))
  }
  return account
}

/** Only upcoming sales can take requests; ?auction= and ?catalogue= pre-select the form. */
export async function requestBidLoader({ request }: LoaderFunctionArgs) {
  await requireSignIn(request)
  const searchParams = new URL(request.url).searchParams
  return {
    auctionId: searchParams.get('auction'),
    catalogueId: searchParams.get('catalogue'),
    auctions: listOpenAuctions(),
  }
}

export function requestedLotsLoader() {
  return { lots: listRequestedLots() }
}

export async function myRequestsLoader({ request }: LoaderFunctionArgs) {
  await requireSignIn(request)
  return { requests: listMyRequests() }
}

/** Only administrators get the list; anyone else signed in is told the page isn't for them. */
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

export async function adminAuctionsLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const searchParams = new URL(request.url).searchParams
  const view = parseAdminAuctionView(searchParams.get('view'))
  const page = parsePageNumber(searchParams.get('page'))
  return { view, page, auctions: listAdminAuctions({ view, page }) }
}

export async function adminAuctionLoader({ request, params }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const auctionId = params.auctionId ?? ''
  return { auctionId, auction: getAdminAuction(auctionId) }
}

/** ?date= comes from the calendar and fills in the sale date */
export async function newAuctionLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const date = new URL(request.url).searchParams.get('date') ?? ''
  return { saleDate: isIsoDate(date) ? date : '' }
}

export async function editAuctionLoader({ request, params }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const auctionId = params.auctionId ?? ''
  return { auctionId, auction: getAdminAuction(auctionId) }
}

export async function adminCataloguesLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const searchParams = new URL(request.url).searchParams
  const period = parseSaleStatus(searchParams.get('period'))
  const page = parsePageNumber(searchParams.get('page'))
  return { period, page, catalogues: listAdminCatalogues({ period, page }) }
}

/** ?auction= chooses the sale when adding a catalogue from it */
export async function newCatalogueLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  return { auctionId: new URL(request.url).searchParams.get('auction') ?? '', auctions: listAllAuctions() }
}

export async function editCatalogueLoader({ request, params }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const catalogueId = params.catalogueId ?? ''
  return { catalogueId, catalogue: getAdminCatalogue(catalogueId), auctions: listAllAuctions() }
}

/** Tabs by status, and optional filters for one sale (?auction=) and a customer search (?customer=) */
export async function reviewRequestsLoader({ request }: LoaderFunctionArgs) {
  await requireAdministrator(request)
  const searchParams = new URL(request.url).searchParams
  const filters = {
    view: parseReviewView(searchParams.get('view')),
    page: parsePageNumber(searchParams.get('page')),
    auction: searchParams.get('auction')?.trim() ?? '',
    customer: searchParams.get('customer')?.trim() ?? '',
  }
  return { ...filters, requests: listReviewRequests(filters), auctions: listAllAuctions() }
}

export function cataloguesLoader({ request }: LoaderFunctionArgs) {
  const { status, page } = readListParams(request)
  return { status, page, catalogues: listCatalogues({ status, page }) }
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
