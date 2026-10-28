import type { RequestHandler } from 'express'
import { config } from '../config/env.ts'
import { readCookie } from '../lib/cookies.ts'
import { deleteSessionByTokenHash, findActiveSession, touchSession } from '../repositories/sessionsRepository.ts'
import { clearSessionCookie, sessionCookieName } from '../security/cookies.ts'
import { hashSecretToken } from '../security/secretTokens.ts'

// Activity is recorded at most once a minute, to avoid a database write on every request.
const touchIntervalMs = 60_000

/**
 * Identifies the signed-in user from the session cookie. Visitors pass through with no
 * res.locals.auth. An expired, idle or unknown session is deleted and its cookie cleared.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const token = readCookie(req, sessionCookieName)
  if (!token) {
    next()
    return
  }

  const tokenHash = hashSecretToken(token)
  const session = await findActiveSession(tokenHash, config.auth.sessionIdleMinutes)
  if (!session) {
    await deleteSessionByTokenHash(tokenHash)
    clearSessionCookie(res)
    next()
    return
  }

  if (Date.now() - session.lastSeenAt.getTime() > touchIntervalMs) {
    await touchSession(session.id)
  }
  res.locals.auth = { sessionId: session.id, user: session.user }
  next()
}
