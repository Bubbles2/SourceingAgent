import { Router } from 'express'
import { bySignedInUser, rateLimit } from '../../middleware/rateLimit.ts'
import { requireRole } from '../../middleware/requireAuth.ts'
import { validate } from '../../middleware/validate.ts'
import * as cataloguesController from './cataloguesController.ts'
import { catalogueParams, createCatalogueBody, listCataloguesQuery, updateCatalogueBody } from './cataloguesValidation.ts'

export function createCataloguesRouter(): Router {
  const router = Router()
  // Only administrators manage catalogues; everyone else can read those of published sales.
  const manage = [requireRole('administrator'), rateLimit({ windowMs: 60 * 60_000, max: 300, key: bySignedInUser })]

  router.get('/', validate({ query: listCataloguesQuery }), cataloguesController.list)
  router.get('/:catalogueId', validate({ params: catalogueParams }), cataloguesController.show)
  router.post('/', ...manage, validate({ body: createCatalogueBody }), cataloguesController.create)
  router.patch(
    '/:catalogueId',
    ...manage,
    validate({ params: catalogueParams, body: updateCatalogueBody }),
    cataloguesController.update,
  )
  router.delete('/:catalogueId', ...manage, validate({ params: catalogueParams }), cataloguesController.remove)

  return router
}
