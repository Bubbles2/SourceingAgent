// Values middleware stores on res.locals for later handlers.
import type { UserRecord } from '../repositories/usersRepository.ts'

declare global {
  namespace Express {
    interface Locals {
      /** Set by requestContext for every request */
      requestId: string
      /** Set by authenticate when the request carries a valid session cookie; absent for visitors */
      auth?: {
        sessionId: string
        user: UserRecord
      }
      /** Set by validate() with the parsed params, query and body */
      validated?: {
        params?: unknown
        query?: unknown
        body?: unknown
      }
    }
  }
}

export {}
