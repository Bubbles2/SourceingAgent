// Route loaders start data requests as navigation begins and hand the promises to the page,
// which renders skeletons inside <Suspense> until they resolve.
import type { LoaderFunctionArgs } from 'react-router'
import { getAuction, listAuctions, listAuctionsBetween, listFeaturedAuctions } from '../features/auctions/auctionService'
import { parseSaleStatus } from '../features/auctions/saleStatus'
import { getMonthGridRange, parseMonthKey } from '../features/calendar/calendarDates'
import { listCatalogues } from '../features/catalogues/catalogueService'

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

export function cataloguesLoader({ request }: LoaderFunctionArgs) {
  const status = readSaleStatus(request)
  return { status, catalogues: listCatalogues({ status }) }
}
