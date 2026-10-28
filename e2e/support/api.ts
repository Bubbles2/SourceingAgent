import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'

/** Sends a change with a fresh CSRF token, as the website does */
export async function sendChange(
  api: APIRequestContext,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: object,
): Promise<APIResponse> {
  const body: unknown = await (await api.get('/api/auth/csrf')).json()
  const csrfToken = typeof body === 'object' && body !== null && 'csrfToken' in body ? String(body.csrfToken) : ''
  return api.fetch(path, { method, data, headers: { 'X-CSRF-Token': csrfToken } })
}

export async function expectStatus(response: APIResponse, status: number): Promise<void> {
  expect(response.status(), await response.text()).toBe(status)
}

/** A Paris date this many days from today (YYYY-MM-DD) */
export function parisDate(daysAhead: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + daysAhead)
  return date.toISOString().slice(0, 10)
}
