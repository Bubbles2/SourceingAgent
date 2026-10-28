import type { Request, Response } from 'express'
import { createBidRequest, listMyBidRequests, type CustomerBidRequest } from './bidRequestsService.ts'
import type { CreateBidRequestBody } from './bidRequestsValidation.ts'

function signedInUser(res: Response) {
  const user = res.locals.auth?.user
  if (!user) {
    throw new Error('bid request handlers require requireAuth')
  }
  return user
}

/** GET /api/bid-requests — the signed-in customer's own requests, newest first */
export async function list(_req: Request, res: Response<{ requests: CustomerBidRequest[] }>): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json({ requests: await listMyBidRequests(signedInUser(res).id) })
}

/** POST /api/bid-requests — a new request, pending the agent's review */
export async function create(
  _req: Request,
  res: Response<{ request: CustomerBidRequest }, { validated: { body: CreateBidRequestBody } }>,
): Promise<void> {
  const request = await createBidRequest(signedInUser(res), res.locals.validated.body)
  res.status(201).json({ request })
}
