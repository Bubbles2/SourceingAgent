import type { LogContext } from './logger.ts'

function stringField(error: Error, key: string): string | undefined {
  const value: unknown = Reflect.get(error, key)
  return typeof value === 'string' ? value : undefined
}

/**
 * Safe fields for logging an error. Leaves out PostgreSQL's `detail` and `where`, which can quote
 * row values such as email addresses.
 */
export function describeError(error: unknown, { includeStack = false } = {}): LogContext {
  if (!(error instanceof Error)) {
    return { errorType: typeof error }
  }
  return {
    errorName: error.name,
    errorMessage: error.message,
    errorCode: stringField(error, 'code'),
    constraint: stringField(error, 'constraint'),
    table: stringField(error, 'table'),
    stack: includeStack ? error.stack : undefined,
  }
}
