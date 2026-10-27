// Browser-only stand-in for the users table and the session cookie. Accounts created in the prototype
// are kept in localStorage on top of the demo account, without passwords, and the "session" is just the
// signed-in account id. Anyone using this browser can read or change both, so this is not
// authentication; Phase 2 replaces this module with the API and secure cookie sessions.
import type { CustomerAccount } from '../features/auth/types'
import { mockDemoAccount } from '../mocks/accounts'

const accountsKey = 'psa:mock-accounts:v1'
const sessionKey = 'psa:mock-session:v1'

// Used when localStorage is unavailable (private mode, blocked storage)
let inMemoryAccounts: CustomerAccount[] = []
let inMemorySessionId: string | null = null

const listeners = new Set<() => void>()
// Cached so React's useSyncExternalStore sees the same object until the session changes
let sessionSnapshot: CustomerAccount | null | undefined

function isOptionalString(value: unknown): boolean {
  return value === null || typeof value === 'string'
}

function isCustomerAccount(value: unknown): value is CustomerAccount {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.firstName === 'string' &&
    typeof record.lastName === 'string' &&
    typeof record.email === 'string' &&
    typeof record.countryCode === 'string' &&
    isOptionalString(record.companyName) &&
    isOptionalString(record.telephone) &&
    typeof record.createdAt === 'string'
  )
}

function readStoredAccounts(): CustomerAccount[] {
  try {
    const stored = window.localStorage.getItem(accountsKey)
    if (!stored) {
      return inMemoryAccounts
    }
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isCustomerAccount) : []
  } catch {
    return inMemoryAccounts
  }
}

function writeStoredAccounts(accounts: CustomerAccount[]): void {
  inMemoryAccounts = accounts
  try {
    window.localStorage.setItem(accountsKey, JSON.stringify(accounts))
  } catch {
    // Storage unavailable: accounts stay in memory until the page reloads.
  }
}

function readSessionAccountId(): string | null {
  try {
    return window.localStorage.getItem(sessionKey)
  } catch {
    return inMemorySessionId
  }
}

function writeSessionAccountId(accountId: string | null): void {
  inMemorySessionId = accountId
  try {
    if (accountId) {
      window.localStorage.setItem(sessionKey, accountId)
    } else {
      window.localStorage.removeItem(sessionKey)
    }
  } catch {
    // Storage unavailable: the session lasts until the page reloads.
  }
}

function listAccounts(): CustomerAccount[] {
  return [mockDemoAccount, ...readStoredAccounts()]
}

/** Expects a normalised (trimmed, lower-case) email */
export function findAccountByEmail(email: string): CustomerAccount | null {
  return listAccounts().find((account) => account.email === email) ?? null
}

export function addAccount(account: CustomerAccount): void {
  writeStoredAccounts([...readStoredAccounts(), account])
}

/** The signed-in account, read fresh from storage */
export function readSessionAccount(): CustomerAccount | null {
  const accountId = readSessionAccountId()
  return accountId ? (listAccounts().find((account) => account.id === accountId) ?? null) : null
}

function refreshSession(): void {
  sessionSnapshot = readSessionAccount()
  for (const listener of listeners) {
    listener()
  }
}

export function setSessionAccount(accountId: string | null): void {
  writeSessionAccountId(accountId)
  refreshSession()
}

/** For useSyncExternalStore: the same object until the session changes */
export function getSessionSnapshot(): CustomerAccount | null {
  if (sessionSnapshot === undefined) {
    sessionSnapshot = readSessionAccount()
  }
  return sessionSnapshot
}

// Signing in or out in another tab updates this one too.
function handleStorage(event: StorageEvent): void {
  if (event.key === null || event.key === sessionKey || event.key === accountsKey) {
    refreshSession()
  }
}

export function subscribeToSession(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('storage', handleStorage)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorage)
    }
  }
}
