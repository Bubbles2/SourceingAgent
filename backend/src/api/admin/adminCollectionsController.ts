import type { Request, Response } from 'express'
import { createCollection, getRunningJob, getStatus } from '../../services/CollectionSetvice.ts'
import type { collectionJobParams, createCollectionBody } from './adminValidation.ts'
import type { z } from 'zod'

/** POST /api/admin/collections — accepts a request only after the collector accepts it. */
export async function create(_req: Request, res: Response): Promise<void> {
  const { maxAuctions } = res.locals.validated!.body as z.infer<typeof createCollectionBody>
  const run = await createCollection(maxAuctions)
  res.set('Cache-Control', 'no-store')
  res.status(202).json({ message: 'Collection request submitted.', ...run })
}

/** GET /api/admin/collections/running — latest active job, or null. */
export async function running(_req: Request, res: Response): Promise<void> {
  const run = await getRunningJob()
  res.set('Cache-Control', 'no-store')
  res.json(run)
}

/** GET /api/admin/collections/:jobId — status of one collector job. */
export async function status(_req: Request, res: Response): Promise<void> {
  const { jobId } = res.locals.validated!.params as z.infer<typeof collectionJobParams>
  const run = await getStatus(jobId)
  res.set('Cache-Control', 'no-store')
  res.json(run)
}
