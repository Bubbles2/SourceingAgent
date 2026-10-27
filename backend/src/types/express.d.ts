// Values middleware stores on res.locals for later handlers.
declare global {
  namespace Express {
    interface Locals {
      /** Set by requestContext for every request */
      requestId: string
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
