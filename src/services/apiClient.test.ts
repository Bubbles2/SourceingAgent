import { describe, expect, it, vi } from 'vitest'

type Call = { url: string; init: RequestInit }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Answers fetch calls in order and records them. */
function stubFetch(...responses: (Response | Error)[]): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const next = responses.shift()
      if (!next) {
        throw new Error(`Unexpected request to ${url}`)
      }
      if (next instanceof Error) {
        throw next
      }
      return next
    }),
  )
  return calls
}

function header(call: Call | undefined, name: string): string | null {
  return new Headers(call?.init.headers).get(name)
}

/** A fresh module each time, so no CSRF token is cached between tests */
async function loadClient(): Promise<typeof import('./apiClient')> {
  vi.resetModules()
  return import('./apiClient')
}

describe('apiRequest', () => {
  it('reads data without a CSRF token, on the same origin', async () => {
    const { apiRequest } = await loadClient()
    const calls = stubFetch(json(200, { lots: [] }))

    await expect(apiRequest('/api/requested-lots')).resolves.toEqual({ lots: [] })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.credentials).toBe('same-origin')
    expect(header(calls[0], 'X-CSRF-Token')).toBeNull()
  })

  it('fetches a CSRF token once and sends it with every change', async () => {
    const { apiRequest } = await loadClient()
    const calls = stubFetch(json(200, { csrfToken: 'token-1' }), json(202, { message: 'ok' }), json(202, { message: 'ok' }))

    await apiRequest('/api/auth/password-reset/request', { method: 'POST', body: { email: 'a@b.co' } })
    await apiRequest('/api/auth/password-reset/request', { method: 'POST', body: { email: 'c@d.co' } })

    expect(calls.map((call) => call.url)).toEqual([
      '/api/auth/csrf',
      '/api/auth/password-reset/request',
      '/api/auth/password-reset/request',
    ])
    expect(header(calls[1], 'X-CSRF-Token')).toBe('token-1')
    expect(header(calls[2], 'X-CSRF-Token')).toBe('token-1')
    expect(header(calls[1], 'Content-Type')).toBe('application/json')
    expect(calls[1]?.init.body).toBe(JSON.stringify({ email: 'a@b.co' }))
  })

  it('switches to the token an auth response issues for the new session', async () => {
    const { apiRequest } = await loadClient()
    const calls = stubFetch(
      json(200, { csrfToken: 'visitor-token' }),
      json(200, { user: {}, csrfToken: 'session-token' }),
      json(200, { csrfToken: 'after-logout' }),
    )

    await apiRequest('/api/auth/login', { method: 'POST', body: {} })
    await apiRequest('/api/auth/logout', { method: 'POST' })
    expect(header(calls[2], 'X-CSRF-Token')).toBe('session-token')
  })

  it('retries once with a fresh token when the session changed in another tab', async () => {
    const { apiRequest } = await loadClient()
    const calls = stubFetch(
      json(200, { csrfToken: 'stale' }),
      json(403, { error: { code: 'csrf_invalid', message: 'Refresh the page.', requestId: 'r1' } }),
      json(200, { csrfToken: 'fresh' }),
      json(201, { request: { id: 'x' } }),
    )

    await expect(apiRequest('/api/bid-requests', { method: 'POST', body: {} })).resolves.toEqual({ request: { id: 'x' } })
    expect(header(calls[3], 'X-CSRF-Token')).toBe('fresh')
  })

  it('turns API errors into ApiError with their code, message and field details', async () => {
    const { apiRequest, ApiError } = await loadClient()
    stubFetch(
      json(200, { csrfToken: 't' }),
      json(400, {
        error: {
          code: 'validation_failed',
          message: 'Some of the information sent is missing or invalid.',
          details: [{ path: 'body.email', message: 'Enter your email address.' }],
          requestId: 'r2',
        },
      }),
    )

    const error = await apiRequest('/api/auth/register', { method: 'POST', body: {} }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'validation_failed',
      details: [{ path: 'body.email', message: 'Enter your email address.' }],
    })
  })

  it('reports a failing proxy or server without an error body as temporarily unavailable', async () => {
    const { apiRequest } = await loadClient()
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

    await expect(apiRequest('/api/auth/session')).rejects.toMatchObject({ status: 502, code: 'service_unavailable' })
  })

  it('reports an unreachable server as a network error', async () => {
    const { apiRequest } = await loadClient()
    stubFetch(new TypeError('Failed to fetch'))

    await expect(apiRequest('/api/auth/session')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })
})
