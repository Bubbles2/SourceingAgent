import type { Request, Response } from 'express'
import { listRequestedLots, type RequestedLot } from './requestedLotsService.ts'

/** GET /api/requested-lots — public; reserved first, then by sale date */
export async function list(_req: Request, res: Response<{ lots: RequestedLot[] }>): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json({ lots: await listRequestedLots() })
}
