import type { Request, Response } from 'express'
import {
  changeCatalogue,
  createCatalogue,
  getCatalogue,
  getCataloguePage,
  removeCatalogue,
  type CataloguePage,
} from './cataloguesService.ts'
import type { CatalogueWithAuctionView } from './catalogueView.ts'
import type { CreateCatalogueBody, ListCataloguesQuery, UpdateCatalogueBody } from './cataloguesValidation.ts'

type CatalogueParams = { catalogueId: string }

// Reads may differ by viewer (administrators see drafts), so browsers may keep them but must check
// back each time, and shared caches must not keep them at all.
const readCaching = 'private, no-cache'

function administrator(res: Response) {
  const user = res.locals.auth?.user
  if (!user) {
    throw new Error('catalogue changes require requireRole')
  }
  return user
}

/** GET /api/catalogues?period=&auction=&status=&limit=&offset= */
export async function list(
  _req: Request,
  res: Response<CataloguePage, { validated: { query: ListCataloguesQuery } }>,
): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json(await getCataloguePage(res.locals.validated.query, res.locals.auth?.user))
}

/** GET /api/catalogues/:catalogueId */
export async function show(
  _req: Request,
  res: Response<{ catalogue: CatalogueWithAuctionView }, { validated: { params: CatalogueParams } }>,
): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json({ catalogue: await getCatalogue(res.locals.validated.params.catalogueId, res.locals.auth?.user) })
}

/** POST /api/catalogues — administrators only */
export async function create(
  _req: Request,
  res: Response<{ catalogue: CatalogueWithAuctionView }, { validated: { body: CreateCatalogueBody } }>,
): Promise<void> {
  const catalogue = await createCatalogue(res.locals.validated.body, administrator(res))
  res.status(201).json({ catalogue })
}

/** PATCH /api/catalogues/:catalogueId — administrators only */
export async function update(
  _req: Request,
  res: Response<{ catalogue: CatalogueWithAuctionView }, { validated: { params: CatalogueParams; body: UpdateCatalogueBody } }>,
): Promise<void> {
  const { params, body } = res.locals.validated
  res.json({ catalogue: await changeCatalogue(params.catalogueId, body, administrator(res)) })
}

/** DELETE /api/catalogues/:catalogueId — administrators only, for catalogues without bid requests */
export async function remove(_req: Request, res: Response<void, { validated: { params: CatalogueParams } }>): Promise<void> {
  await removeCatalogue(res.locals.validated.params.catalogueId, administrator(res))
  res.status(204).end()
}
