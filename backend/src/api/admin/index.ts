// Administrator-only endpoints. The role check is applied where this router is mounted (api/index.ts).
import { Router } from 'express'
import { bySignedInUser, rateLimit } from '../../middleware/rateLimit.ts'
import { validate } from '../../middleware/validate.ts'
import * as adminBidRequestsController from './adminBidRequestsController.ts'
import * as adminUsersController from './adminUsersController.ts'
import { bidRequestParams, listBidRequestsQuery, listUsersQuery, statusChangeBody } from './adminValidation.ts'

export function createAdminRouter(): Router {
  const router = Router()

  router.get('/users', validate({ query: listUsersQuery }), adminUsersController.list)

  // Reviewing bid requests: accept or reject them, then record the bid and its result.
  const changesByUser = rateLimit({ windowMs: 60 * 60_000, max: 600, key: bySignedInUser })
  router.get('/bid-requests', validate({ query: listBidRequestsQuery }), adminBidRequestsController.list)
  router.get('/bid-requests/:requestId', validate({ params: bidRequestParams }), adminBidRequestsController.show)
  router.post(
    '/bid-requests/:requestId/status-changes',
    changesByUser,
    validate({ params: bidRequestParams, body: statusChangeBody }),
    adminBidRequestsController.createStatusChange,
  )

  return router
}
