import { Router } from 'express'
import * as requestedLotsController from './requestedLotsController.ts'

export const requestedLotsRouter = Router()

requestedLotsRouter.get('/', requestedLotsController.list)
