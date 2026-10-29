import type { Request, Response } from 'express'
import { getLotPage, type LotPage } from './lotsService.ts'
import type { ListLotsQuery } from './lotsValidation.ts'

/** GET /api/lots?auction=&period=&limit=&offset= */
export async function list(_req: Request, res: Response<LotPage, { validated: { query: ListLotsQuery } }>): Promise<void> {
  // The monitor adds and updates lots at any time, so browsers may keep this but must check back each time.
  res.set('Cache-Control', 'no-cache')
  res.json(await getLotPage(res.locals.validated.query))
}
