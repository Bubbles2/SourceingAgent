// CSRF protection with signed double-submit tokens (OWASP's recommended stateless pattern).
// A token is a random nonce plus an HMAC of that nonce and the current session id, so it only works
// for the session it was issued to. The browser keeps a copy in an HttpOnly cookie and the site
// sends it back in the X-CSRF-Token header; another site can neither read it nor send that header.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config/env.ts'

export const csrfHeaderName = 'x-csrf-token'

/** Visitors without a session share this binding until they sign in. */
const anonymousBinding = 'anonymous'

export function csrfBinding(sessionId: string | undefined): string {
  return sessionId ?? anonymousBinding
}

function sign(binding: string, nonce: string): string {
  return createHmac('sha256', config.auth.secret).update(`${binding}|${nonce}`).digest('base64url')
}

export function issueCsrfToken(binding: string): string {
  const nonce = randomBytes(16).toString('base64url')
  return `${nonce}.${sign(binding, nonce)}`
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The header must match the cookie, and both must be signed for this session. */
export function isValidCsrfToken(headerToken: string, cookieToken: string, binding: string): boolean {
  if (!safeEqual(headerToken, cookieToken)) {
    return false
  }
  const [nonce, signature, extra] = headerToken.split('.')
  if (!nonce || !signature || extra !== undefined) {
    return false
  }
  return safeEqual(signature, sign(binding, nonce))
}
