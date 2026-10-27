import type { Request, Response } from 'express'
import { getHealthReport, type HealthReport } from './healthService.ts'

/** GET /api/health — 200 when the API and database are working, 503 when the database isn't. */
export async function get(_req: Request, res: Response<HealthReport>): Promise<void> {
  const report = await getHealthReport()
  res.set('Cache-Control', 'no-store')
  res.status(report.status === 'ok' ? 200 : 503).json(report)
}
