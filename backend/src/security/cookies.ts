// The session and CSRF cookies. Both are HttpOnly (scripts can't read them) and SameSite=Strict
// (browsers don't send them on requests started by other sites). With COOKIE_SECURE they are also
// Secure and use the __Host- prefix, which pins them to this host and path.
import type { CookieOptions, Response } from 'express'
import { config } from '../config/env.ts'

function cookieName(name: string): string {
  return config.auth.cookieSecure ? `__Host-${name}` : name
}

export const sessionCookieName = cookieName('psa_session')
export const csrfCookieName = cookieName('psa_csrf')

const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: config.auth.cookieSecure,
  sameSite: 'strict',
  path: '/',
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(sessionCookieName, token, { ...baseOptions, expires: expiresAt })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(sessionCookieName, baseOptions)
}

/** Lasts as long as the browser session; the token inside is tied to the signed-in session. */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(csrfCookieName, token, baseOptions)
}
