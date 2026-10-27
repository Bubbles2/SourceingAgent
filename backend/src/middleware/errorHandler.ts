// Turns every error into the same JSON shape ({ error: { code, message, details?, requestId } }).
// Expected problems keep their message; anything unexpected is logged and answered with a generic
// 500, so stack traces, SQL and database details never reach the client.
import type { ErrorRequestHandler } from 'express'
import pg from 'pg'
import { config } from '../config/env.ts'
import { describeError } from '../lib/describeError.ts'
import { HttpError, type ErrorDetail, type ErrorResponseBody } from '../lib/httpError.ts'
import { logger } from '../lib/logger.ts'

type Problem = {
  status: number
  code: string
  message: string
  details?: readonly ErrorDetail[]
}

const internalError: Problem = {
  status: 500,
  code: 'internal_error',
  message: 'Something went wrong on our side. Please try again.',
}

const databaseUnavailable: Problem = {
  status: 503,
  code: 'service_unavailable',
  message: 'The service is temporarily unavailable. Please try again shortly.',
}

// Node and PostgreSQL codes meaning the database can't be reached or won't accept the connection
const unavailableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', '28P01', '3D000', '53300', '57P01', '57P03'])

/** Errors raised by express.json() for malformed or oversized bodies */
function bodyParserProblem(error: unknown): Problem | null {
  if (!(error instanceof Error)) {
    return null
  }
  const type: unknown = Reflect.get(error, 'type')
  if (type === 'entity.parse.failed') {
    return { status: 400, code: 'invalid_json', message: 'The request body is not valid JSON.' }
  }
  if (type === 'entity.too.large') {
    return { status: 413, code: 'payload_too_large', message: 'The request body is too large.' }
  }
  if (type === 'encoding.unsupported' || type === 'charset.unsupported') {
    return { status: 415, code: 'unsupported_media_type', message: 'Send the request body as UTF-8 JSON.' }
  }
  return null
}

/** Constraint violations that slipped past service checks become client errors, without their details */
function databaseProblem(error: pg.DatabaseError): Problem | null {
  switch (error.code) {
    case '23505':
      return { status: 409, code: 'conflict', message: 'This conflicts with an existing record.' }
    case '23503':
    case '23001':
      return { status: 409, code: 'conflict', message: 'This refers to a record that does not exist or is still in use.' }
    case '23502':
    case '23514':
    case '22001':
    case '22003':
    case '22P02':
      return { status: 400, code: 'invalid_data', message: 'Some of the information sent is not valid.' }
    default:
      return null
  }
}

function toProblem(error: unknown): Problem {
  if (error instanceof HttpError) {
    return { status: error.status, code: error.code, message: error.message, details: error.details }
  }
  const bodyProblem = bodyParserProblem(error)
  if (bodyProblem) {
    return bodyProblem
  }
  if (error instanceof pg.DatabaseError) {
    const problem = databaseProblem(error)
    if (problem) {
      return problem
    }
  }
  const code: unknown = error instanceof Error ? Reflect.get(error, 'code') : undefined
  if (typeof code === 'string' && unavailableCodes.has(code)) {
    return databaseUnavailable
  }
  return internalError
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }

  const problem = toProblem(error)
  if (problem.status >= 500) {
    logger.error('Request failed', {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      ...describeError(error, { includeStack: config.env !== 'production' }),
    })
  }

  const body: ErrorResponseBody = {
    error: {
      code: problem.code,
      message: problem.message,
      ...(problem.details ? { details: problem.details } : {}),
      requestId: res.locals.requestId,
    },
  }
  res.status(problem.status).json(body)
}
