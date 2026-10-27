// Every API domain, mounted under /api. The URL maps to the folder: /api/health -> src/api/health/.
import { Router } from 'express'
import { healthRouter } from './health/index.ts'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
