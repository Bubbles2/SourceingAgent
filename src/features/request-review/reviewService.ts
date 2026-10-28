// The agent's review of bid requests (/api/admin/bid-requests). Never cached: requests change as
// they are reviewed, and the API checks every change against the request's current status.
import { ApiError, apiRequest } from '../../services/apiClient'
import { pageOffset, type Page } from '../../services/pagination'
import { refreshSession } from '../auth/sessionStore'
import type { BidRequestStatus } from '../bid-requests/types'
import { parseChangedRequest, parseReviewDetail, parseReviewPage } from './reviewResponses'
import type { ReviewBidRequest, ReviewDetail, ReviewView } from './types'

export const reviewPageSize = 25

/** The statuses each tab of the review page lists */
export const viewStatuses: Record<ReviewView, readonly BidRequestStatus[]> = {
  pending: ['pending'],
  accepted: ['accepted'],
  placed: ['placed'],
  closed: ['rejected', 'cancelled', 'won', 'lost'],
}

export function listReviewRequests({ view, page }: { view: ReviewView; page: number }): Promise<Page<ReviewBidRequest>> {
  const search = new URLSearchParams({
    status: viewStatuses[view].join(','),
    limit: String(reviewPageSize),
    offset: String(pageOffset(page, reviewPageSize)),
  })
  return apiRequest(`/api/admin/bid-requests?${search}`).then(parseReviewPage)
}

export type DetailResult = { ok: true; detail: ReviewDetail } | { ok: false; message: string }

/**
 * A request with its audit trail. Never rejects, so the review dialog can say what went wrong
 * instead of the whole page showing its error screen.
 */
export async function getReviewDetail(id: string): Promise<DetailResult> {
  try {
    const data = await apiRequest(`/api/admin/bid-requests/${encodeURIComponent(id)}`)
    return { ok: true, detail: parseReviewDetail(data) }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error
    }
    return { ok: false, message: error.message }
  }
}

export type StatusChangeResult = { ok: true; request: ReviewBidRequest } | { ok: false; code: string; message: string }

/**
 * Moves a request on from the status the administrator saw (`from`). The API refuses the change if
 * the request has moved on since, or the step isn't allowed; the message says why.
 */
export async function changeRequestStatus(
  id: string,
  change: { from: BidRequestStatus; to: BidRequestStatus; note: string },
): Promise<StatusChangeResult> {
  try {
    const data = await apiRequest(`/api/admin/bid-requests/${encodeURIComponent(id)}/status-changes`, {
      method: 'POST',
      body: change,
    })
    return { ok: true, request: parseChangedRequest(data) }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error
    }
    if (error.code === 'unauthenticated' || error.code === 'forbidden') {
      // Signed out, or no longer an administrator: let the header and page catch up.
      void refreshSession()
    }
    const detail = error.details[0]?.message
    return { ok: false, code: error.code, message: error.code === 'validation_failed' && detail ? detail : error.message }
  }
}
