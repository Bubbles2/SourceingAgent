// The shared PostgreSQL connection pool. Repositories pass values separately from SQL text
// ($1, $2, …) so input is never concatenated into a query.
import pg from 'pg'
import { config } from '../config/env.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'

/** Connection settings for pg and node-pg-migrate. Contains the password: never log it. */
export const connectionConfig: pg.ClientConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl ? { rejectUnauthorized: true } : false,
  application_name: 'french-sourcing-agent-api',
}

// NUMERIC columns (money) arrive as strings such as "12500.00", never as floating-point numbers.
export const pool = new pg.Pool({
  ...connectionConfig,
  max: config.database.poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
})

// An idle client can fail when the server restarts; the pool replaces it.
pool.on('error', (error) => {
  logger.error('Idle database connection failed', describeError(error))
})

/** The pool, or one client inside withTransaction; repositories accept either. */
export type Queryable = pg.Pool | pg.PoolClient

export function query<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<pg.QueryResult<Row>> {
  return pool.query<Row>(text, values)
}

/** Runs `work` in a transaction on one connection, rolling back if it throws. */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export function closePool(): Promise<void> {
  return pool.end()
}
