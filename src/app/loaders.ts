// Route loaders start data requests as navigation begins and hand the promises to the page,
// which renders skeletons inside <Suspense> until they resolve.
import { redirect, type LoaderFunctionArgs } from 'react-router'
import {
  getAuction,
  listAuctions,
  listAuctionsBetween,
  listFeaturedAuctions,
  listOpenAuctions,
} from '../features/auctions/auctionService'
import { parseSaleStatus } from '../features/auctions/saleStatus'
import { loadSession } from '../features/auth/sessionStore'
import { listMyRequests, listRequestedLots } from '../features/bid-requests/bidRequestService'
import { getMonthGridRange, parseMonthKey } from '../features/calendar/calendarDates'
import { listCatalogues } from '../features/catalogues/catalogueService'
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
async function requireSignIn(request: Request): Promise<void> {
  if (!(await loadSession())) {
    const url = new URL(request.url)
    throw redirect(signInPath(`${url.pathname}${url.search}`))
  }
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
