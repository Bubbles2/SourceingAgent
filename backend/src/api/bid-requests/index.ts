import { Router } from 'express'
import { bySignedInUser, rateLimit } from '../../middleware/rateLimit.ts'
import { requireAuth, requireRole, requireVerifiedEmail } from '../../middleware/requireAuth.ts'
import { validate } from '../../middleware/validate.ts'
import * as bidRequestsController from './bidRequestsController.ts'
import { createBidRequestBody } from './bidRequestsValidation.ts'

export function createBidRequestsRouter(): Router {
  const router = Router()
  const submitsByUser = rateLimit({ windowMs: 60 * 60_000, max: 30, key: bySignedInUser })

  router.get('/', requireAuth, bidRequestsController.list)
  // Only customers with a confirmed email address can ask the agent to bid.
  router.post(
    '/',
    requireRole('customer'),
    requireVerifiedEmail,
    submitsByUser,
    validate({ body: createBidRequestBody }),
    bidRequestsController.create,
  )

  return router
}
