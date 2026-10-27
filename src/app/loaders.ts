// Route loaders start data requests as navigation begins and hand the promises to the page,
// which renders skeletons inside <Suspense> until they resolve.
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { getAuction, listAuctions, listAuctionsBetween, listFeaturedAuctions } from '../features/auctions/auctionService'
import { parseSaleStatus } from '../features/auctions/saleStatus'
import { getCurrentAccount, isSignedIn } from '../features/auth/authService'
import { listMyRequests, listRequestedLots } from '../features/bid-requests/bidRequestService'
import { getMonthGridRange, parseMonthKey } from '../features/calendar/calendarDates'
import { listCatalogues } from '../features/catalogues/catalogueService'
import { paths, signInPath } from './paths'

function readSaleStatus(request: Request) {
  return parseSaleStatus(new URL(request.url).searchParams.get('status'))
}

export function landingLoader() {
  return { featuredAuctions: listFeaturedAuctions() }
}

export function auctionsLoader({ request }: LoaderFunctionArgs) {
  const status = readSaleStatus(request)
  return { status, auctions: listAuctions({ status }) }
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

/** Only upcoming sales can take requests; ?auction= and ?catalogue= pre-select the form. */
export function requestBidLoader({ request }: LoaderFunctionArgs) {
  const searchParams = new URL(request.url).searchParams
  return {
    auctionId: searchParams.get('auction'),
    catalogueId: searchParams.get('catalogue'),
    auctions: listAuctions({ status: 'upcoming' }),
  }
}

export function requestedLotsLoader() {
  return { lots: listRequestedLots() }
}

export function myRequestsLoader() {
  return { requests: listMyRequests() }
}

export function cataloguesLoader({ request }: LoaderFunctionArgs) {
  const status = readSaleStatus(request)
  return { status, catalogues: listCatalogues({ status }) }
}

/** Signed-in customers skip the sign-in and registration pages. */
export function guestOnlyLoader() {
  if (isSignedIn()) {
    throw redirect(paths.account)
  }
  return null
}

/** Signed-out visitors are sent to sign in, then brought back here. */
export function accountLoader() {
  if (!isSignedIn()) {
    throw redirect(signInPath(paths.account))
  }
  return { account: getCurrentAccount() }
}
