export type ErrorDetail = {
  /** Where the problem is, such as "body.email" */
  path: string
  message: string
}

/** An error with a status and a message that are safe to send to the client. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details: readonly ErrorDetail[] | undefined

  constructor(status: number, code: string, message: string, details?: readonly ErrorDetail[]) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** The JSON body of every error response */
export type ErrorResponseBody = {
  error: {
    code: string
    message: string
    details?: readonly ErrorDetail[]
    /** Matches the X-Request-Id header and the server logs */
    requestId: string
  }
}
