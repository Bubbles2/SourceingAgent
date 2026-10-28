// Who is signed in, shared by the header, footer, loaders and account pages. The session itself is
// an HttpOnly cookie the site can't read, so this asks the API (/api/auth/session) and keeps the answer.
import { apiRequest } from '../../services/apiClient'
import { parseAccountResponse } from './accountResponse'
import type { CustomerAccount } from './types'

const listeners = new Set<() => void>()
let current: CustomerAccount | null = null
let loading: Promise<CustomerAccount | null> | null = null

// Signing in or out in one tab tells the others to ask again.
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('psa-session')

function publish(account: CustomerAccount | null): void {
  current = account
  for (const listener of listeners) {
    listener()
  }
}

async function fetchCurrentAccount(): Promise<CustomerAccount | null> {
  try {
    const data = await apiRequest('/api/auth/session')
    const signedOut = typeof data === 'object' && data !== null && 'user' in data && data.user === null
    return signedOut ? null : parseAccountResponse(data)
  } catch {
    // The API is unreachable: carry on as a visitor, and ask again next time.
    loading = null
    return null
  }
}

/** The signed-in customer, fetched once and then kept up to date. */
export function loadSession(): Promise<CustomerAccount | null> {
  loading ??= fetchCurrentAccount().then((account) => {
    publish(account)
    return account
  })
  return loading
}

/** Asks the API again, e.g. after confirming an email address. */
export function refreshSession(): Promise<CustomerAccount | null> {
  loading = null
  return loadSession()
}

/** After signing in, registering or signing out: update this tab and tell the others. */
export function setSessionAccount(account: CustomerAccount | null): void {
  loading = Promise.resolve(account)
  publish(account)
  channel?.postMessage('changed')
}

/** Tells other tabs to ask again, e.g. after this tab confirmed the email address. */
export function announceSessionChange(): void {
  channel?.postMessage('changed')
}

channel?.addEventListener('message', () => {
  void refreshSession()
})

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSessionSnapshot(): CustomerAccount | null {
  return current
}
