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

/** Customer links; per DESIGN.md §6.1 the header only shows these once sign-in exists. */
export const accountNavItems: readonly NavItem[] = [
  { label: 'Sign in', to: paths.signIn },
  { label: 'Create account', to: paths.register },
  { label: 'Request a bid', to: paths.requestBid },
  { label: 'My requests', to: paths.myRequests },
]
