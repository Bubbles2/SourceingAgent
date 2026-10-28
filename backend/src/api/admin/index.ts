// Administrator-only endpoints. The role check is applied where this router is mounted (api/index.ts).
import { Router } from 'express'
import { validate } from '../../middleware/validate.ts'
import * as adminUsersController from './adminUsersController.ts'
import { listUsersQuery } from './adminValidation.ts'

export function createAdminRouter(): Router {
  const router = Router()

  router.get('/users', validate({ query: listUsersQuery }), adminUsersController.list)

  return router
}
