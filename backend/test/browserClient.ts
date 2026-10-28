// Behaves like the website in a browser: keeps cookies between requests and sends the CSRF token
// on every change, so tests exercise the same flow customers do.
import { z } from 'zod'

type RequestOptions = {
  body?: unknown
  /** false to leave out the X-CSRF-Token header */
  csrf?: boolean
  headers?: Record<string, string>
}

export type ApiResponse = {
  status: number
  headers: Headers
  setCookies: string[]
  body: unknown
}

const csrfBody = z.object({ csrfToken: z.string() })

export class BrowserClient {
  readonly cookies = new Map<string, string>()
  csrfToken: string | null = null
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  get(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    return this.request('GET', path, options)
  }

  post(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<ApiResponse> {
    return this.request('POST', path, { ...options, body })
  }

  patch(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<ApiResponse> {
    return this.request('PATCH', path, { ...options, body })
  }

  delete(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    return this.request('DELETE', path, options)
  }

  async refreshCsrfToken(): Promise<string> {
    const response = await this.get('/api/auth/csrf')
    this.csrfToken = csrfBody.parse(response.body).csrfToken
    return this.csrfToken
  }

  private async request(method: string, path: string, { body, csrf = true, headers = {} }: RequestOptions): Promise<ApiResponse> {
    const requestHeaders = new Headers(headers)
    if (body !== undefined) {
      requestHeaders.set('Content-Type', 'application/json')
    }
    if (method !== 'GET' && csrf) {
      requestHeaders.set('X-CSRF-Token', this.csrfToken ?? (await this.refreshCsrfToken()))
    }
    if (this.cookies.size > 0) {
      requestHeaders.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookies = response.headers.getSetCookie()
    this.storeCookies(setCookies)

    const text = await response.text()
    const parsed: unknown = text ? JSON.parse(text) : null
    const issued = csrfBody.safeParse(parsed)
    if (issued.success) {
      this.csrfToken = issued.data.csrfToken
    }
    return { status: response.status, headers: response.headers, setCookies, body: parsed }
  }

  private storeCookies(setCookies: string[]): void {
    for (const cookie of setCookies) {
      const [pair = '', ...attributes] = cookie.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const expired = attributes.some((attribute) => /expires=thu, 01 jan 1970/i.test(attribute.trim()))
      if (expired || value === '') {
        this.cookies.delete(name)
      } else {
        this.cookies.set(name, value)
      }
    }
  }
}
