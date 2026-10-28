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
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  account: '/account',
  myRequests: '/my-requests',
  reviewRequests: '/admin/requests',
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

/** Sign-in page that returns to `redirectTo` once the customer has signed in */
export function signInPath(redirectTo: string): string {
  return `${paths.signIn}?${new URLSearchParams({ redirectTo }).toString()}`
}

/** Accepts only paths on this site, so a crafted ?redirectTo= link can't send customers elsewhere. */
export function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null
  }
  return value
}
