import { paths } from './paths'

export type NavItem = {
  label: string
  to: string
}

/** Public browsing links shown in the header and the footer's Explore column. */
export const mainNavItems: readonly NavItem[] = [
  { label: 'Auctions', to: paths.auctions },
  { label: 'Catalogues', to: paths.catalogues },
  { label: 'Calendar', to: paths.calendar },
  { label: 'Requested lots', to: paths.requestedLots },
]

/** Shown in the header and footer while signed out (DESIGN.md §6.1) */
export const guestAccountNavItems: readonly NavItem[] = [
  { label: 'Sign in', to: paths.signIn },
  { label: 'Create account', to: paths.register },
]

/** Shown in the footer while signed in; the header shows the avatar link instead */
export const customerAccountNavItems: readonly NavItem[] = [{ label: 'Your account', to: paths.account }]

/** In the footer for everyone; visitors are asked to sign in first, then brought back */
export const bidRequestNavItems: readonly NavItem[] = [
  { label: 'Request a bid', to: paths.requestBid },
  { label: 'My requests', to: paths.myRequests },
]
