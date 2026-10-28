import { Router } from 'express'
import { bySignedInUser, rateLimit } from '../../middleware/rateLimit.ts'
import { requireRole } from '../../middleware/requireAuth.ts'
import { validate } from '../../middleware/validate.ts'
import * as auctionsController from './auctionsController.ts'
import { auctionParams, createAuctionBody, listAuctionsQuery, updateAuctionBody } from './auctionsValidation.ts'

export function createAuctionsRouter(): Router {
  const router = Router()
  // Only administrators manage sales; everyone else can read published ones.
  const manage = [requireRole('administrator'), rateLimit({ windowMs: 60 * 60_000, max: 300, key: bySignedInUser })]

  router.get('/', validate({ query: listAuctionsQuery }), auctionsController.list)
  router.get('/:auctionId', validate({ params: auctionParams }), auctionsController.show)
  router.post('/', ...manage, validate({ body: createAuctionBody }), auctionsController.create)
  router.patch('/:auctionId', ...manage, validate({ params: auctionParams, body: updateAuctionBody }), auctionsController.update)
  router.delete('/:auctionId', ...manage, validate({ params: auctionParams }), auctionsController.remove)

  return router
}
