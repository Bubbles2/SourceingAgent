import type { Request, Response } from 'express'
import {
  changeStatus,
  getReviewPage,
  getReviewRequest,
  type ReviewBidRequest,
  type ReviewPage,
  type StatusChange,
} from './adminBidRequestsService.ts'
import type { ListBidRequestsQuery, StatusChangeBody } from './adminValidation.ts'

type RequestParams = { requestId: string }

function administrator(res: Response) {
  const user = res.locals.auth?.user
  if (!user) {
    throw new Error('admin handlers require requireRole')
  }
  return user
}

/** GET /api/admin/bid-requests?status=pending&limit=&offset= */
export async function list(_req: Request, res: Response<ReviewPage, { validated: { query: ListBidRequestsQuery } }>): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json(await getReviewPage(res.locals.validated.query))
}

/** GET /api/admin/bid-requests/:requestId — the request with its audit trail */
export async function show(
  _req: Request,
  res: Response<{ request: ReviewBidRequest; history: StatusChange[] }, { validated: { params: RequestParams } }>,
): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json(await getReviewRequest(res.locals.validated.params.requestId))
}

/** POST /api/admin/bid-requests/:requestId/status-changes — { from, to, note } */
export async function createStatusChange(
  _req: Request,
  res: Response<{ request: ReviewBidRequest }, { validated: { params: RequestParams; body: StatusChangeBody } }>,
): Promise<void> {
  const { params, body } = res.locals.validated
  const request = await changeStatus(params.requestId, body, administrator(res))
  res.status(201).json({ request })
}
