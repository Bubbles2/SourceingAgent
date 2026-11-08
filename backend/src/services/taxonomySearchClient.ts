// Client for the taxonomy search service (taxonomy_search/ in this repository, see taxonomy_search/INTEGRATION.md).
// The service listens on 127.0.0.1 and accepts only callers that send the shared token, which stays on the
// server: it is never sent to the browser.
import { config } from '../config/env.ts'
import { HttpError } from '../lib/httpError.ts'

type CallOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  timeoutMs?: number
}

export type TaxonomyReply = { data: unknown; text: string; contentType: string; disposition: string | null }

const notRunning = 'The search service is not running. Start it with: npm run taxonomy (see taxonomy_search/INTEGRATION.md).'

function errorFor(status: number, detail: unknown): HttpError {
  const message = typeof detail === 'string' && detail.length <= 300 ? `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` : null
  switch (status) {
    case 400:
      return new HttpError(400, 'invalid_request', message ?? 'The request was not accepted by the search service.')
    case 404:
      return new HttpError(404, 'not_found', message ?? 'Not found.')
    case 409:
      return new HttpError(409, 'conflict', message ?? 'Another job is still running.')
    case 422:
      return new HttpError(400, 'validation_failed', 'Some of the information sent is missing or invalid.')
    case 401:
    case 503:
      return new HttpError(503, 'search_not_configured', 'The search service rejected the server\'s token. Check TAXONOMY_SERVICE_TOKEN in backend/.env and taxonomy_search/.env.')
    default:
      return new HttpError(502, 'search_failed', 'The search service could not complete this request. Please try again.')
  }
}

/** Call the service; any failure becomes an HttpError that is safe to show. */
export async function callTaxonomy(path: string, options: CallOptions = {}): Promise<TaxonomyReply> {
  const { serviceUrl, serviceToken } = config.taxonomy
  if (!serviceToken) {
    throw new HttpError(503, 'search_not_configured', 'Search is not configured yet. Set TAXONOMY_SERVICE_TOKEN in backend/.env.')
  }
  const url = new URL(path, serviceUrl)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json, text/csv',
        'X-Service-Token': serviceToken,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    })
  } catch {
    throw new HttpError(503, 'search_unavailable', notRunning)
  }
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  let data: unknown = null
  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new HttpError(502, 'search_response_invalid', 'The search service returned an invalid response.')
    }
  }
  if (!response.ok) {
    const detail = data !== null && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : null
    throw errorFor(response.status, detail)
  }
  return { data, text, contentType, disposition: response.headers.get('content-disposition') }
}
