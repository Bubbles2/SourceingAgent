// Bid request calls to the API. The server checks every rule again (sign-in, a confirmed email,
// open sale, lot range, one request per lot) and enforces the per-lot rules in the database.
import { ApiError, apiRequest } from '../../services/apiClient'
import { refreshSession } from '../auth/sessionStore'
import { parseCreatedBidRequest, parseMyBidRequests, parseRequestedLots } from './bidRequestResponses'
import type { BidRequestErrors, BidRequestField } from './bidRequestValidation'
import type { BidRequestInput, MyBidRequest, RequestedLot } from './types'

export type SubmitBidRequestResult = { ok: true; request: MyBidRequest } | { ok: false; errors: BidRequestErrors }

// Rule failures the API reports for one field
const codeFields: Partial<Record<string, BidRequestField>> = {
  sale_closed: 'auctionId',
  catalogue_mismatch: 'catalogueId',
  lot_out_of_range: 'lotNumber',
  lot_reserved: 'lotNumber',
  already_requested: 'lotNumber',
}

// Validation problems arrive as "body.<field>"
const detailFields: Partial<Record<string, BidRequestField>> = {
  'body.auctionId': 'auctionId',
  'body.catalogueId': 'catalogueId',
  'body.lotNumber': 'lotNumber',
  'body.maxBidEur': 'maxBid',
  'body.instructions': 'instructions',
}

function toFormErrors(error: ApiError): BidRequestErrors {
  const errors: BidRequestErrors = {}
  const field = codeFields[error.code]
  if (field) {
    errors[field] = error.message
    return errors
  }
  for (const detail of error.details) {
    const detailField = detailFields[detail.path]
    if (detailField && !errors[detailField]) {
      errors[detailField] = detail.message
    }
  }
  // Anything else (signed out, email not confirmed, too many requests, server unreachable) goes at the top.
  return Object.keys(errors).length > 0 ? errors : { form: error.message }
}

/** The signed-in customer's requests, newest first */
export async function listMyRequests(): Promise<MyBidRequest[]> {
  return parseMyBidRequests(await apiRequest('/api/bid-requests'))
}

/** Public list of lots with an accepted request; the API sends no customer, amount or request id. */
export async function listRequestedLots(): Promise<RequestedLot[]> {
  return parseRequestedLots(await apiRequest('/api/requested-lots'))
}

export async function submitBidRequest(input: BidRequestInput): Promise<SubmitBidRequestResult> {
  try {
    const request = parseCreatedBidRequest(await apiRequest('/api/bid-requests', { method: 'POST', body: input }))
    return { ok: true, request }
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error
    }
    if (error.code === 'unauthenticated') {
      // The session ended while the form was open; let the header catch up.
      void refreshSession()
    }
    return { ok: false, errors: toFormErrors(error) }
  }
}
