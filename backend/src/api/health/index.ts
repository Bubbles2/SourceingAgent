import { Router } from 'express'
import * as healthController from './healthController.ts'

export const healthRouter = Router()

healthRouter.get('/', healthController.get)
