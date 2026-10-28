import type { To } from 'react-router'
import { hasControlCharacters } from '../utils/links'

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
  admin: '/admin',
  adminAuctions: '/admin/auctions',
  adminCatalogues: '/admin/catalogues',
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

export function adminAuctionPath(auctionId: string): string {
  return `${paths.adminAuctions}/${encodeURIComponent(auctionId)}`
}

export function editAuctionPath(auctionId: string): string {
  return `${adminAuctionPath(auctionId)}/edit`
}

/** The new-auction form, with the sale date filled in when it was chosen on the calendar */
export function newAuctionPath(saleDate?: string): string {
  return saleDate ? `${paths.adminAuctions}/new?${new URLSearchParams({ date: saleDate }).toString()}` : `${paths.adminAuctions}/new`
}

export function editCataloguePath(catalogueId: string): string {
  return `${paths.adminCatalogues}/${encodeURIComponent(catalogueId)}/edit`
}

/** The new-catalogue form, with its sale chosen when opened from that sale */
export function newCataloguePath(auctionId?: string): string {
  return auctionId ? `${paths.adminCatalogues}/new?${new URLSearchParams({ auction: auctionId }).toString()}` : `${paths.adminCatalogues}/new`
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
