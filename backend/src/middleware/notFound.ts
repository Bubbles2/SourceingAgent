import type { RequestHandler } from 'express'
import { HttpError } from '../lib/httpError.ts'

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'not_found', 'No API endpoint matches this request.'))
}
