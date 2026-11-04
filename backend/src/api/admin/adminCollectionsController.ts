import type { Request, Response } from 'express'
import { createCollection } from '../../services/CollectionSetvice.ts'
import type { createCollectionBody } from './adminValidation.ts'
import type { z } from 'zod'

/** POST /api/admin/collections — accepts a request only after the collector accepts it. */
export async function create(_req: Request, res: Response): Promise<void> {
  const { maxAuctions } = res.locals.validated!.body as z.infer<typeof createCollectionBody>
  await createCollection(maxAuctions)
  res.set('Cache-Control', 'no-store')
  res.status(202).json({ message: 'Collection request submitted.' })
}
