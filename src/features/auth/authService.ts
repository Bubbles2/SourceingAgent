// Account calls to the API. Passwords go to the server over the same origin and are never kept in
// the browser; the session is an HttpOnly cookie the site can't read.
import { apiRequest } from '../../services/apiClient'
import { parseAccountResponse } from './accountResponse'
import { announceSessionChange, refreshSession, setSessionAccount } from './sessionStore'
import type { CustomerAccount, RegistrationInput, SignInInput } from './types'

export async function registerCustomer(input: RegistrationInput): Promise<CustomerAccount> {
  const account = parseAccountResponse(await apiRequest('/api/auth/register', { method: 'POST', body: input }))
  setSessionAccount(account)
  return account
}

export async function signIn(input: SignInInput): Promise<CustomerAccount> {
  const account = parseAccountResponse(await apiRequest('/api/auth/login', { method: 'POST', body: input }))
  setSessionAccount(account)
  return account
}

export async function signOut(): Promise<void> {
  await apiRequest('/api/auth/logout', { method: 'POST' })
  setSessionAccount(null)
}

/** Answers the same whether or not the email has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/api/auth/password-reset/request', { method: 'POST', body: { email } })
}

/** Every session for the account ends, including this browser's. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await apiRequest('/api/auth/password-reset', { method: 'POST', body: { token, password } })
  setSessionAccount(null)
}

export async function confirmEmail(token: string): Promise<void> {
  await apiRequest('/api/auth/email-verification', { method: 'POST', body: { token } })
  // If this browser is signed in to that account, show it as confirmed here and in other tabs.
  await refreshSession()
  announceSessionChange()
}

export async function resendVerificationEmail(): Promise<string> {
  const data = await apiRequest('/api/auth/email-verification/resend', { method: 'POST' })
  return typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
    ? data.message
    : 'We have sent a new confirmation link.'
}
