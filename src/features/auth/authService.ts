// Simulated auth API. Everything runs in the browser: passwords are never stored, sent or compared,
// and the session is a browser flag anyone can change. The Express API replaces these calls with
// hashed passwords, secure cookie sessions and server-side validation (SPEC.md §6).
import { mockRoundTrip } from '../../services/mockApi'
import { addAccount, findAccountByEmail, readSessionAccount, setSessionAccount } from '../../services/mockAuthStore'
import {
  checkCompanyName,
  checkCountry,
  checkEmail,
  checkName,
  checkNewPassword,
  checkTelephone,
  normalizeEmail,
  normalizeTelephone,
} from './authRules'
import type { CustomerAccount, RegistrationInput, SignInInput } from './types'

/** Requests with this email fail as if the server were down, to demonstrate the error state. */
export const mockOutageEmail = 'unavailable@example.com'

export type RegistrationField = keyof RegistrationInput

export type RegisterResult =
  | { ok: true; account: CustomerAccount }
  | { ok: false; field: RegistrationField; message: string }

export type SignInResult = { ok: true; account: CustomerAccount } | { ok: false; message: string }

function simulateOutage(email: string): void {
  if (email === mockOutageEmail) {
    throw new Error('Mock auth service unavailable')
  }
}

function findRegistrationProblem(input: RegistrationInput): { field: RegistrationField; message: string } | null {
  const checks: [RegistrationField, string | null][] = [
    ['firstName', checkName(input.firstName, 'first name')],
    ['lastName', checkName(input.lastName, 'last name')],
    ['email', checkEmail(input.email)],
    ['password', checkNewPassword(input.password)],
    ['countryCode', checkCountry(input.countryCode)],
    ['companyName', checkCompanyName(input.companyName ?? '')],
    ['telephone', checkTelephone(input.telephone ?? '')],
  ]
  for (const [field, message] of checks) {
    if (message) {
      return { field, message }
    }
  }
  return null
}

/** Creates the account and signs the customer in. */
export async function registerCustomer(input: RegistrationInput): Promise<RegisterResult> {
  await mockRoundTrip()
  const normalized: RegistrationInput = {
    ...input,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizeEmail(input.email),
    companyName: input.companyName?.trim() || null,
    telephone: input.telephone ? normalizeTelephone(input.telephone) || null : null,
  }
  simulateOutage(normalized.email)

  const problem = findRegistrationProblem(normalized)
  if (problem) {
    return { ok: false, ...problem }
  }
  if (findAccountByEmail(normalized.email)) {
    return {
      ok: false,
      field: 'email',
      message: 'An account already exists for this email address. Sign in instead, or use a different email address.',
    }
  }

  // The password stops here: the profile never includes it. The live API hashes it before storing.
  const account: CustomerAccount = {
    id: `cust-${crypto.randomUUID()}`,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    email: normalized.email,
    countryCode: normalized.countryCode,
    companyName: normalized.companyName,
    telephone: normalized.telephone,
    createdAt: new Date().toISOString(),
  }
  addAccount(account)
  setSessionAccount(account.id)
  return { ok: true, account }
}

/** The prototype keeps no passwords, so any password signs in to an email it knows. */
export async function signIn({ email, password }: SignInInput): Promise<SignInResult> {
  await mockRoundTrip()
  const normalizedEmail = normalizeEmail(email)
  simulateOutage(normalizedEmail)

  const account = findAccountByEmail(normalizedEmail)
  if (!account || !password) {
    // One message for both cases, so the form never reveals which emails have accounts.
    return { ok: false, message: 'The email address or password is incorrect.' }
  }
  setSessionAccount(account.id)
  return { ok: true, account }
}

export async function signOut(): Promise<void> {
  await mockRoundTrip()
  setSessionAccount(null)
}

/** Always succeeds the same way, so the form never reveals which emails have accounts. No email is sent. */
export async function requestPasswordReset(email: string): Promise<void> {
  await mockRoundTrip()
  simulateOutage(normalizeEmail(email))
}

export async function getCurrentAccount(): Promise<CustomerAccount | null> {
  await mockRoundTrip()
  return readSessionAccount()
}

/** Synchronous check for route loaders */
export function isSignedIn(): boolean {
  return readSessionAccount() !== null
}
