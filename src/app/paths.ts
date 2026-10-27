import type { To } from 'react-router'

export const paths = {
  home: '/',
  auctions: '/auctions',
  catalogues: '/catalogues',
  calendar: '/calendar',
  requestedLots: '/requested-lots',
  requestBid: '/request-bid',
  signIn: '/sign-in',
  register: '/register',
  myRequests: '/my-requests',
  terms: '/terms',
  privacy: '/privacy',
} as const

// In-page anchors
export const featuredAuctionsId = 'auctions'
export const feesNoticeId = 'fees-notice'
export const auctionCataloguesId = 'catalogues'

export function auctionPath(auctionId: string): string {
  return `${paths.auctions}/${encodeURIComponent(auctionId)}`
}

export function requestBidPath(auctionId: string, catalogueId?: string): To {
  const search = new URLSearchParams({ auction: auctionId })
  if (catalogueId) {
    search.set('catalogue', catalogueId)
  }
  return { pathname: paths.requestBid, search: `?${search.toString()}` }
}
