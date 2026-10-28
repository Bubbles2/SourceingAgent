import type { Request, Response } from 'express'
import { clearSessionCookie, setCsrfCookie, setSessionCookie } from '../../security/cookies.ts'
import { csrfBinding, issueCsrfToken } from '../../security/csrf.ts'
import {
  confirmEmail,
  registerCustomer,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  signIn,
  signOut,
  type SignedIn,
} from './authService.ts'
import type {
  EmailVerificationBody,
  PasswordResetBody,
  PasswordResetRequestBody,
  RegisterBody,
  SignInBody,
} from './authValidation.ts'
import { toPublicUser, type PublicUser } from './publicUser.ts'

type Validated<Body> = { validated: { body: Body } }

type CsrfResponse = { csrfToken: string }
type UserResponse = { user: PublicUser }
type MessageResponse = { message: string }

/** New CSRF token for the session the browser now has (or none), in a cookie and the response. */
function rotateCsrfToken(res: Response, sessionId: string | undefined): string {
  const token = issueCsrfToken(csrfBinding(sessionId))
  setCsrfCookie(res, token)
  return token
}

function startSession(res: Response, { user, session }: SignedIn): UserResponse & CsrfResponse {
  setSessionCookie(res, session.token, session.expiresAt)
  return { user: toPublicUser(user), csrfToken: rotateCsrfToken(res, session.sessionId) }
}

/** GET /api/auth/csrf — the token the site sends back in X-CSRF-Token on changes */
export function csrf(_req: Request, res: Response<CsrfResponse>): void {
  res.set('Cache-Control', 'no-store')
  res.json({ csrfToken: rotateCsrfToken(res, res.locals.auth?.sessionId) })
}

/** POST /api/auth/register */
export async function register(_req: Request, res: Response<UserResponse & CsrfResponse, Validated<RegisterBody>>): Promise<void> {
  const signedIn = await registerCustomer(res.locals.validated.body)
  res.status(201).json(startSession(res, signedIn))
}

/** POST /api/auth/login */
export async function login(_req: Request, res: Response<UserResponse & CsrfResponse, Validated<SignInBody>>): Promise<void> {
  const signedIn = await signIn(res.locals.validated.body, res.locals.auth?.sessionId)
  res.json(startSession(res, signedIn))
}

/** POST /api/auth/logout — ends this browser's session; succeeds even if it already had none */
export async function logout(_req: Request, res: Response<CsrfResponse>): Promise<void> {
  const sessionId = res.locals.auth?.sessionId
  if (sessionId) {
    await signOut(sessionId)
  }
  clearSessionCookie(res)
  res.json({ csrfToken: rotateCsrfToken(res, undefined) })
}

/** GET /api/auth/session — who is signed in, or { user: null } for a visitor (never 401) */
export function session(_req: Request, res: Response<{ user: PublicUser | null }>): void {
  const auth = res.locals.auth
  res.set('Cache-Control', 'no-store')
  res.json({ user: auth ? toPublicUser(auth.user) : null })
}

/** GET /api/auth/me — the signed-in user (requireAuth answers 401 for visitors) */
export function me(_req: Request, res: Response<UserResponse>): void {
  const auth = res.locals.auth
  if (!auth) {
    throw new Error('me() requires requireAuth')
  }
  res.set('Cache-Control', 'no-store')
  res.json({ user: toPublicUser(auth.user) })
}

/** POST /api/auth/password-reset/request — the same answer whether or not the email has an account */
export async function passwordResetRequest(
  _req: Request,
  res: Response<MessageResponse, Validated<PasswordResetRequestBody>>,
): Promise<void> {
  await requestPasswordReset(res.locals.validated.body.email)
  res.status(202).json({ message: 'If an account exists for that email address, we have sent it a link to reset the password.' })
}

/** POST /api/auth/password-reset — every session for the account ends, including this browser's */
export async function passwordReset(
  _req: Request,
  res: Response<MessageResponse & CsrfResponse, Validated<PasswordResetBody>>,
): Promise<void> {
  await resetPassword(res.locals.validated.body)
  clearSessionCookie(res)
  res.json({
    message: 'Your password has been changed. Sign in with your new password.',
    csrfToken: rotateCsrfToken(res, undefined),
  })
}

/** POST /api/auth/email-verification — works whether or not the browser is signed in */
export async function emailVerification(
  _req: Request,
  res: Response<MessageResponse, Validated<EmailVerificationBody>>,
): Promise<void> {
  await confirmEmail(res.locals.validated.body.token)
  res.json({ message: 'Your email address is confirmed.' })
}

/** POST /api/auth/email-verification/resend */
export async function emailVerificationResend(_req: Request, res: Response<MessageResponse>): Promise<void> {
  const auth = res.locals.auth
  if (!auth) {
    throw new Error('emailVerificationResend() requires requireAuth')
  }
  await resendVerificationEmail(auth.user)
  res.status(202).json({ message: `We have sent a new confirmation link to ${auth.user.email}.` })
}
