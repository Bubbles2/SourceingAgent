import type { ButtonVariant } from '../../components/ui/Button'
import type { BidRequestStatus } from '../bid-requests/types'
import type { ReviewView } from './types'

/** Every status a request can move to; only submission makes a request pending. */
export type Decision = Exclude<BidRequestStatus, 'pending'>

export const decisionButtons: Record<Decision, { label: string; variant: ButtonVariant }> = {
  accepted: { label: 'Accept', variant: 'primary' },
  rejected: { label: 'Reject', variant: 'danger' },
  cancelled: { label: 'Cancel request', variant: 'secondary' },
  placed: { label: 'Record bid placed', variant: 'primary' },
  won: { label: 'Record won', variant: 'primary' },
  lost: { label: 'Record lost', variant: 'secondary' },
}

export function isDecision(status: BidRequestStatus): status is Decision {
  return status !== 'pending'
}

export const reviewViewOptions: readonly { value: ReviewView; label: string }[] = [
  { value: 'pending', label: 'Pending review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'placed', label: 'Bid placed' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

/** Reads the `view` search param, defaulting to requests waiting for review. */
export function parseReviewView(value: string | null): ReviewView {
  return reviewViewOptions.find((option) => option.value === value)?.value ?? 'pending'
}

/** The page's address for a tab and page, keeping any filters */
export function reviewSearch(view: ReviewView, filters: { auction: string; customer: string }, page = 1): string {
  const search = new URLSearchParams({ view })
  if (filters.auction) {
    search.set('auction', filters.auction)
  }
  if (filters.customer) {
    search.set('customer', filters.customer)
  }
  if (page > 1) {
    search.set('page', String(page))
  }
  return `?${search.toString()}`
}

const parisTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "28 Oct 2026, 09:14", in Paris time */
export function formatChangeTime(isoDateTime: string): string {
  return parisTimeFormatter.format(new Date(isoDateTime))
}
