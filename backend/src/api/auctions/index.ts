import { Router } from 'express'
import { validate } from '../../middleware/validate.ts'
import * as auctionsController from './auctionsController.ts'
import { auctionParams, listAuctionsQuery } from './auctionsValidation.ts'

export function createAuctionsRouter(): Router {
  const router = Router()

  router.get('/', validate({ query: listAuctionsQuery }), auctionsController.list)
  router.get('/:auctionId', validate({ params: auctionParams }), auctionsController.show)
  router.get('/:auctionId/lots', validate({ params: auctionParams }), auctionsController.lots)

  return router
}
