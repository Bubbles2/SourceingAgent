import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { logger } from '../lib/logger.ts'

/**
 * Gives each request an id (returned as X-Request-Id and included in error responses) and logs
 * one line when it finishes: method, path without the query string, status and duration.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = randomUUID()
  const startedAt = performance.now()
  res.locals.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  res.on('finish', () => {
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    })
  })
  next()
}
