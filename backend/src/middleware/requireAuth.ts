// Access control. Visitors have no session; customers and administrators are told apart by role.
import type { RequestHandler } from 'express'
import { HttpError } from '../lib/httpError.ts'
import type { UserRole } from '../repositories/usersRepository.ts'

const signInRequired = new HttpError(401, 'unauthenticated', 'Sign in to continue.')

/** Customers and administrators; visitors get 401. */
export const requireAuth: RequestHandler = (_req, res, next) => {
  next(res.locals.auth ? undefined : signInRequired)
}

/** Only the listed roles; visitors get 401 and other roles 403. */
export function requireRole(...roles: readonly UserRole[]): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.auth?.user
    if (!user) {
      next(signInRequired)
      return
    }
    if (!roles.includes(user.role)) {
      next(new HttpError(403, 'forbidden', 'You do not have permission to do that.'))
      return
    }
    next()
  }
}

/** Signed-in users who have confirmed their email address; use after requireAuth or requireRole. */
export const requireVerifiedEmail: RequestHandler = (_req, res, next) => {
  const user = res.locals.auth?.user
  if (!user) {
    next(signInRequired)
    return
  }
  if (!user.emailVerifiedAt) {
    next(
      new HttpError(
        403,
        'email_not_verified',
        'Confirm your email address before requesting a bid. You can ask for a new link from your account page.',
      ),
    )
    return
  }
  next()
}
