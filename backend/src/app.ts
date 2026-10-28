import express, { type Express } from 'express'
import helmet from 'helmet'
import { createApiRouter } from './api/index.ts'
import { config } from './config/env.ts'
import { corsMiddleware } from './middleware/cors.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { notFound } from './middleware/notFound.ts'
import { requestContext } from './middleware/requestContext.ts'

/** Builds the Express app without listening, so tests can start it on any port. */
export function createApp(): Express {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxyHops > 0) {
    // So req.ip (used for rate limits) is the client's address, not the proxy's
    app.set('trust proxy', config.trustProxyHops)
  }

  app.use(requestContext)
  app.use(helmet())
  app.use(corsMiddleware)
  app.use(express.json({ limit: '100kb' }))

  app.use('/api', createApiRouter())

  app.use(notFound)
  app.use(errorHandler)
  return app
}
