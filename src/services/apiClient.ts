// The one way the site talks to the API (same origin, via the Vite proxy in development).
// Sends the CSRF token on every change and turns failures into ApiError with a message that is
// safe to show.

export type ApiErrorDetail = {
  /** Where the problem is, such as "body.email" */
  path: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: readonly ApiErrorDetail[]

  constructor(status: number, code: string, message: string, details: readonly ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** The API turned the request away: signed out or the session ended (401), or not allowed (403). */
export function isAccessError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.code === 'unauthenticated' || error.code === 'forbidden')
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RequestOptions = {
  method?: Method
  body?: unknown
}

const unavailableMessage = 'The service is temporarily unavailable. Please try again in a moment.'
const networkMessage = "We couldn't reach the server. Check your connection and try again."

let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) =>
    isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string'
      ? [{ path: item.path, message: item.message }]
      : [],
  )
}

function toApiError(status: number, data: unknown): ApiError {
  const error = isRecord(data) && isRecord(data.error) ? data.error : null
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiError(status, error.code, error.message, readDetails(error.details))
  }
  // No API error body: the proxy couldn't reach the API, or something in between failed.
  return new ApiError(status, 'service_unavailable', unavailableMessage)
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Auth responses carry a new token whenever the session changes. */
function rememberCsrfToken(data: unknown): void {
  if (isRecord(data) && typeof data.csrfToken === 'string') {
    csrfToken = data.csrfToken
  }
}

async function send(path: string, { method = 'GET', body }: RequestOptions, token: string | null): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' })
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('X-CSRF-Token', token)
  }
  try {
    return await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'network_error', networkMessage)
  }
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken
  }
  csrfRequest ??= apiRequest('/api/auth/csrf')
    .then((data) => {
      if (!isRecord(data) || typeof data.csrfToken !== 'string') {
        throw new ApiError(500, 'unexpected_response', unavailableMessage)
      }
      return data.csrfToken
    })
    .finally(() => {
      csrfRequest = null
    })
  return csrfRequest
}

/**
 * Sends a request and returns the parsed JSON body (or null for an empty one).
 * A change rejected for a stale CSRF token, e.g. after signing in or out in another tab, is retried
 * once with a fresh token.
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const changes = options.method !== undefined && options.method !== 'GET'
  let response = await send(path, options, changes ? await getCsrfToken() : null)
  let data = await readJson(response)

  if (changes && response.status === 403 && toApiError(response.status, data).code === 'csrf_invalid') {
    csrfToken = null
    response = await send(path, options, await getCsrfToken())
    data = await readJson(response)
  }

  if (!response.ok) {
    throw toApiError(response.status, data)
  }
  rememberCsrfToken(data)
  return data
}
