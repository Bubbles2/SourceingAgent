import { query } from '../../db/pool.ts'

/** Round trip to PostgreSQL; throws if the database can't be reached. */
export async function pingDatabase(): Promise<void> {
  await query('SELECT 1')
}
