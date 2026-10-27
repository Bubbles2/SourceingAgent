// npm run migrate:up — applies every pending migration in backend/migrations, all in one transaction.
// npm run migrate:down — reverts the most recent migration.
import { fileURLToPath } from 'node:url'
import { runner } from 'node-pg-migrate'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { connectionConfig } from './pool.ts'

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url))

function readDirection(argument: string | undefined): 'up' | 'down' {
  if (argument === 'up' || argument === 'down') {
    return argument
  }
  throw new Error('Pass "up" or "down", for example: npm run migrate:up')
}

try {
  const direction = readDirection(process.argv[2])
  const migrations = await runner({
    databaseUrl: connectionConfig,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction,
    count: direction === 'down' ? 1 : Infinity,
    checkOrder: true,
    singleTransaction: true,
  })
  logger.info(migrations.length > 0 ? 'Migrations finished' : 'No migrations to run', {
    direction,
    count: migrations.length,
    migrations: migrations.map((migration) => migration.name).join(', '),
  })
} catch (error) {
  logger.error('Migration failed; nothing was changed', describeError(error))
  process.exitCode = 1
}
