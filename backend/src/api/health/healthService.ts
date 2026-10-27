import { describeError } from '../../lib/describeError.ts'
import { logger } from '../../lib/logger.ts'
import { pingDatabase } from './healthRepository.ts'

type DatabaseCheck = { status: 'ok'; latencyMs: number } | { status: 'unavailable' }

export type HealthReport = {
  status: 'ok' | 'unavailable'
  timestamp: string
  uptimeSeconds: number
  checks: {
    database: DatabaseCheck
  }
}

async function checkDatabase(): Promise<DatabaseCheck> {
  const startedAt = performance.now()
  try {
    await pingDatabase()
    return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    // The reason stays in the server log; the public report only says the database is unavailable.
    logger.warn('Database health check failed', describeError(error))
    return { status: 'unavailable' }
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabase()
  return {
    status: database.status === 'ok' ? 'ok' : 'unavailable',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database },
  }
}
