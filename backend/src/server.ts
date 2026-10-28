import { createApp } from './app.ts'
import { config } from './config/env.ts'
import { closePool, query } from './db/pool.ts'
import { describeError } from './lib/describeError.ts'
import { logger } from './lib/logger.ts'
import { deleteExpiredSessions } from './repositories/sessionsRepository.ts'

const server = createApp().listen(config.port, (error?: Error) => {
  if (error) {
    logger.error('API server could not start', { port: config.port, ...describeError(error) })
    process.exit(1)
  }
  logger.info('API server listening', { port: config.port, env: config.env })
  void reportDatabaseConnection()
})

// The API still starts without the database; /api/health reports it as unavailable.
async function reportDatabaseConnection(): Promise<void> {
  try {
    await query('SELECT 1')
    logger.info('Connected to PostgreSQL', { database: config.database.name, host: config.database.host })
  } catch (error) {
    logger.warn('PostgreSQL is not reachable yet. Check the DB_* settings in backend/.env.', describeError(error))
  }
}

// Expired sessions are already refused; this just keeps the table small.
const sessionCleanup = setInterval(() => {
  deleteExpiredSessions(config.auth.sessionIdleMinutes)
    .then((count) => {
      if (count > 0) {
        logger.info('Removed expired sessions', { count })
      }
    })
    .catch((error: unknown) => logger.warn('Session cleanup failed', describeError(error)))
}, 3_600_000)
sessionCleanup.unref()

function shutdown(signal: NodeJS.Signals): void {
  logger.info('Shutting down', { signal })
  // Give open requests up to 10 seconds to finish.
  setTimeout(() => process.exit(1), 10_000).unref()
  server.close(() => {
    void closePool().finally(() => process.exit(0))
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
