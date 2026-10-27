import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'
import { HttpError, type ErrorDetail } from '../lib/httpError.ts'

type RequestPart = 'params' | 'query' | 'body'

export type RequestSchemas = Partial<Record<RequestPart, ZodType>>

const requestParts: readonly RequestPart[] = ['params', 'query', 'body']

/**
 * Validates the request against zod schemas before the controller runs. Parsed values (with
 * defaults applied and unknown keys removed) go on res.locals.validated; any problem becomes a
 * 400 listing every invalid field.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    const details: ErrorDetail[] = []
    const validated: NonNullable<typeof res.locals.validated> = {}

    for (const part of requestParts) {
      const schema = schemas[part]
      if (!schema) {
        continue
      }
      const result = schema.safeParse(req[part])
      if (result.success) {
        validated[part] = result.data
      } else {
        for (const issue of result.error.issues) {
          details.push({ path: [part, ...issue.path.map(String)].join('.'), message: issue.message })
        }
      }
    }

    if (details.length > 0) {
      next(new HttpError(400, 'validation_failed', 'Some of the information sent is missing or invalid.', details))
      return
    }
    res.locals.validated = validated
    next()
  }
}
