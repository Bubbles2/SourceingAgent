import type { Request, Response } from 'express'
import { readAdminSummary, type AdminSummary } from '../../repositories/summaryRepository.ts'

/** GET /api/admin/summary — counts for the dashboard */
export async function show(_req: Request, res: Response<{ summary: AdminSummary }>): Promise<void> {
  res.set('Cache-Control', 'no-store')
  res.json({ summary: await readAdminSummary() })
}
