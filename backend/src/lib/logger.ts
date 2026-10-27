// One JSON line per event. Pass only safe context: never passwords, password hashes, tokens,
// cookies, request bodies, full query strings or database error details (they can contain values).
type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = Record<string, string | number | boolean | null | undefined>

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context })
  if (level === 'info') {
    console.log(line)
  } else {
    console.error(line)
  }
}

export const logger = {
  info: (message: string, context?: LogContext): void => write('info', message, context),
  warn: (message: string, context?: LogContext): void => write('warn', message, context),
  error: (message: string, context?: LogContext): void => write('error', message, context),
}
