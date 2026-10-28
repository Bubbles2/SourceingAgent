import pg from 'pg'

/** True when the error is PostgreSQL refusing a duplicate value for the named unique constraint or index. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return error instanceof pg.DatabaseError && error.code === '23505' && error.constraint === constraint
}
