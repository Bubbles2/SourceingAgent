import { Router } from 'express'
import { requireAuth } from '../../middleware/requireAuth.ts'
import { byBodyEmail, byClientIp, bySignedInUser, rateLimit } from '../../middleware/rateLimit.ts'
import { validate } from '../../middleware/validate.ts'
import * as authController from './authController.ts'
import {
  emailVerificationBody,
  passwordResetBody,
  passwordResetRequestBody,
  registerBody,
  signInBody,
} from './authValidation.ts'

const minutes = (count: number): number => count * 60_000

/** Built per app so each app (and each test) has its own rate-limit counters. */
export function createAuthRouter(): Router {
  const router = Router()

  // Brute-force protection: per client and per account being tried.
  const loginByIp = rateLimit({ windowMs: minutes(15), max: 20, key: byClientIp })
  const loginByEmail = rateLimit({ windowMs: minutes(15), max: 10, key: byBodyEmail })
  const registerByIp = rateLimit({ windowMs: minutes(60), max: 10, key: byClientIp })
  const resetRequestByIp = rateLimit({ windowMs: minutes(60), max: 10, key: byClientIp })
  const resetRequestByEmail = rateLimit({ windowMs: minutes(60), max: 3, key: byBodyEmail })
  const tokenByIp = rateLimit({ windowMs: minutes(60), max: 20, key: byClientIp })
  const resendByUser = rateLimit({ windowMs: minutes(60), max: 3, key: bySignedInUser })

  router.get('/csrf', authController.csrf)
  router.get('/session', authController.session)
  router.get('/me', requireAuth, authController.me)

  router.post('/register', registerByIp, validate({ body: registerBody }), authController.register)
  router.post('/login', loginByIp, loginByEmail, validate({ body: signInBody }), authController.login)
  router.post('/logout', authController.logout)

  router.post(
    '/password-reset/request',
    resetRequestByIp,
    resetRequestByEmail,
    validate({ body: passwordResetRequestBody }),
    authController.passwordResetRequest,
  )
  router.post('/password-reset', tokenByIp, validate({ body: passwordResetBody }), authController.passwordReset)

  router.post('/email-verification', tokenByIp, validate({ body: emailVerificationBody }), authController.emailVerification)
  router.post('/email-verification/resend', requireAuth, resendByUser, authController.emailVerificationResend)

  return router
}
