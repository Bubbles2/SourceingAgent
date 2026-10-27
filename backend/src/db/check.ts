// npm run db:check — confirms the API can reach PostgreSQL with the settings in .env.
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { closePool, query } from './pool.ts'

type ServerInfo = {
  database: string
  user_name: string
  server_version: string
}

try {
  const { rows } = await query<ServerInfo>(
    "SELECT current_database() AS database, current_user AS user_name, current_setting('server_version') AS server_version",
  )
  const info = rows[0]
  logger.info('Connected to PostgreSQL', {
    database: info?.database,
    user: info?.user_name,
    serverVersion: info?.server_version,
  })
} catch (error) {
  logger.error('Could not connect to PostgreSQL. Check the DB_* settings in backend/.env.', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
