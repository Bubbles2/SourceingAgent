import { Router } from 'express'
import { validate } from '../../middleware/validate.ts'
import * as lotsController from './lotsController.ts'
import { listLotsQuery } from './lotsValidation.ts'

export function createLotsRouter(): Router {
  const router = Router()
  router.get('/', validate({ query: listLotsQuery }), lotsController.list)
  return router
}
