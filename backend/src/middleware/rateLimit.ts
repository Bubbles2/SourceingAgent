// Fixed-window rate limiting held in memory. Enough for a single API process; several processes
// would need a shared store such as PostgreSQL or Redis.
import type { Request, RequestHandler, Response } from 'express'
import { HttpError } from '../lib/httpError.ts'

type RateLimitOptions = {
  windowMs: number
  /** Requests allowed per key in each window */
  max: number
  /** What to count by, e.g. the client IP, the email being tried or the user; null skips the limit */
  key: (req: Request, res: Response) => string | null
}

type Window = { count: number; resetAt: number }

export function rateLimit({ windowMs, max, key }: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>()

  // Forget finished windows so the map can't grow without bound.
  setInterval(() => {
    const now = Date.now()
    for (const [entryKey, window] of windows) {
      if (window.resetAt <= now) {
        windows.delete(entryKey)
      }
    }
  }, windowMs).unref()

  return (req, res, next) => {
    const entryKey = key(req, res)
    if (entryKey === null) {
      next()
      return
    }

    const now = Date.now()
    let window = windows.get(entryKey)
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs }
      windows.set(entryKey, window)
    }
    window.count += 1

    if (window.count > max) {
      const retryAfterSeconds = Math.ceil((window.resetAt - now) / 1000)
      const minutes = Math.ceil(retryAfterSeconds / 60)
      res.setHeader('Retry-After', String(retryAfterSeconds))
      next(
        new HttpError(
          429,
          'rate_limited',
          `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
        ),
      )
      return
    }
    next()
  }
}

export function byClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

/** The normalised email in a JSON body, or null when there isn't one to count. */
export function byBodyEmail(req: Request): string | null {
  const body: unknown = req.body
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const email: unknown = Reflect.get(body, 'email')
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null
}

export function bySignedInUser(_req: Request, res: Response): string | null {
  return res.locals.auth?.user.id ?? null
}
