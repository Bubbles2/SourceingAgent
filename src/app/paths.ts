import type { To } from 'react-router'
import { hasControlCharacters } from '../utils/links'

export const paths = {
  home: '/',
  auctions: '/auctions',
  lots: '/lots',
  search: '/search',
  /** The old catalogues page; it now leads to the lots */
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
  admin: '/admin',
  reviewRequests: '/admin/requests',
  terms: '/terms',
  privacy: '/privacy',
} as const

// In-page anchors
export const featuredAuctionsId = 'auctions'
export const feesNoticeId = 'fees-notice'
export const auctionLotsId = 'lots'

export function auctionPath(auctionId: string): string {
  return `${paths.auctions}/${encodeURIComponent(auctionId)}`
}

/** The lots page, showing one sale's lots */
export function auctionLotsPath(auctionId: string): string {
  return `${paths.lots}?${new URLSearchParams({ auction: auctionId }).toString()}`
}

export function requestBidPath(auctionId: string, lotId?: string): To {
  const search = new URLSearchParams({ auction: auctionId })
  if (lotId) {
    search.set('lot', lotId)
  }
  return { pathname: paths.requestBid, search: `?${search.toString()}` }
}

/** The bid request review page, filtered */
export function reviewRequestsPath(filters: { view?: string; auction?: string; customer?: string } = {}): string {
  const search = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])))
  return search.size > 0 ? `${paths.reviewRequests}?${search.toString()}` : paths.reviewRequests
}

/** Sign-in page that returns to `redirectTo` once the customer has signed in */
export function signInPath(redirectTo: string): string {
  return `${paths.signIn}?${new URLSearchParams({ redirectTo }).toString()}`
}

/** Accepts only paths on this site, so a crafted ?redirectTo= link can't send customers elsewhere. */
export function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || hasControlCharacters(value)) {
    return null
  }
  return value
}
