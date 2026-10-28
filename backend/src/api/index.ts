// Every API domain, mounted under /api. The URL maps to the folder: /api/auth -> src/api/auth/.
import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.ts'
import { csrfProtection } from '../middleware/csrfProtection.ts'
import { requireRole } from '../middleware/requireAuth.ts'
import { createAdminRouter } from './admin/index.ts'
import { createAuthRouter } from './auth/index.ts'
import { createBidRequestsRouter } from './bid-requests/index.ts'
import { healthRouter } from './health/index.ts'
import { requestedLotsRouter } from './requested-lots/index.ts'

export function createApiRouter(): Router {
  const router = Router()

  // Before authentication, so monitoring works even when sessions can't be read
  router.use('/health', healthRouter)

  // Everything below knows who is asking, and rejects changes without a valid CSRF token.
  router.use(authenticate)
  router.use(csrfProtection)

  router.use('/auth', createAuthRouter())
  router.use('/bid-requests', createBidRequestsRouter())
  router.use('/requested-lots', requestedLotsRouter)
  router.use('/admin', requireRole('administrator'), createAdminRouter())

  return router
}
