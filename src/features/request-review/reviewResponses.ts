// Checks the review API's responses (backend src/api/admin) against the contract.
import type { Page } from '../../services/pagination'
import { boolean, integer, isRecord, list, nested, nullableText, oneOf, record, text } from '../../services/responseFields'
import { parseRequestSaleAndLot, wholeEuros } from '../bid-requests/bidRequestResponses'
import { bidRequestStatuses } from '../bid-requests/types'
import type { ReviewBidRequest, ReviewDetail, StatusChange } from './types'

export function parseReviewBidRequest(value: unknown): ReviewBidRequest {
  const fields = record(value)
  const customer = nested(fields, 'customer')
  return {
    id: text(fields, 'id'),
    maxBidEur: wholeEuros(fields, 'maxBidEur'),
    instructions: text(fields, 'instructions'),
    status: oneOf(fields, 'status', bidRequestStatuses),
    submittedAt: text(fields, 'submittedAt'),
    ...parseRequestSaleAndLot(fields),
    customer: {
      firstName: text(customer, 'firstName'),
      lastName: text(customer, 'lastName'),
      email: text(customer, 'email'),
      companyName: nullableText(customer, 'companyName'),
    },
    lotHeldByOther: boolean(fields, 'lotHeldByOther'),
    nextStatuses: list(fields, 'nextStatuses').map((status) => oneOf({ status }, 'status', bidRequestStatuses)),
  }
}

function parseStatusChange(value: unknown): StatusChange {
  const fields = record(value)
  const changedBy = fields.changedBy
  return {
    fromStatus: fields.fromStatus === null ? null : oneOf(fields, 'fromStatus', bidRequestStatuses),
    toStatus: oneOf(fields, 'toStatus', bidRequestStatuses),
    changedAt: text(fields, 'changedAt'),
    note: nullableText(fields, 'note'),
    changedBy: isRecord(changedBy) ? { name: text(changedBy, 'name'), role: text(changedBy, 'role') } : null,
  }
}

/** { requests, total, limit, offset } */
export function parseReviewPage(data: unknown): Page<ReviewBidRequest> {
  const fields = record(data)
  return {
    items: list(fields, 'requests').map(parseReviewBidRequest),
    total: integer(fields, 'total'),
    limit: integer(fields, 'limit'),
    offset: integer(fields, 'offset'),
  }
}

/** { request, history } */
export function parseReviewDetail(data: unknown): ReviewDetail {
  const fields = record(data)
  return { request: parseReviewBidRequest(fields.request), history: list(fields, 'history').map(parseStatusChange) }
}

/** { request }, after a status change */
export function parseChangedRequest(data: unknown): ReviewBidRequest {
  return parseReviewBidRequest(record(data).request)
}
