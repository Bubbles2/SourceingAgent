import express, { type Express } from 'express'
import helmet from 'helmet'
import { apiRouter } from './api/index.ts'
import { corsMiddleware } from './middleware/cors.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { notFound } from './middleware/notFound.ts'
import { requestContext } from './middleware/requestContext.ts'

/** Builds the Express app without listening, so tests can start it on any port. */
export function createApp(): Express {
  const app = express()
  app.disable('x-powered-by')

  app.use(requestContext)
  app.use(helmet())
  app.use(corsMiddleware)
  app.use(express.json({ limit: '100kb' }))

  app.use('/api', apiRouter)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
