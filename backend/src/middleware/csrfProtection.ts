import type { RequestHandler } from 'express'
import { config } from '../config/env.ts'
import { readCookie } from '../lib/cookies.ts'
import { HttpError } from '../lib/httpError.ts'
import { csrfCookieName } from '../security/cookies.ts'
import { csrfBinding, csrfHeaderName, isValidCsrfToken } from '../security/csrf.ts'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const trustedOrigins = new Set([config.appOrigin, ...config.corsOrigins])

/**
 * Every request that changes something must come from a trusted origin (when the browser says
 * where it came from) and carry a CSRF token signed for the current session. Runs after
 * authenticate, which decides the session.
 */
export const csrfProtection: RequestHandler = (req, res, next) => {
  if (safeMethods.has(req.method)) {
    next()
    return
  }

  const origin = req.get('origin')
  if (origin && !trustedOrigins.has(origin)) {
    next(new HttpError(403, 'origin_not_allowed', 'Requests from this site are not allowed.'))
    return
  }

  const headerToken = req.get(csrfHeaderName)
  const cookieToken = readCookie(req, csrfCookieName)
  const binding = csrfBinding(res.locals.auth?.sessionId)
  if (!headerToken || !cookieToken || !isValidCsrfToken(headerToken, cookieToken, binding)) {
    next(
      new HttpError(
        403,
        'csrf_invalid',
        'This request could not be verified, possibly because your session changed. Refresh the page and try again.',
      ),
    )
    return
  }
  next()
}
