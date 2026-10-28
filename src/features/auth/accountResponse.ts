import { ApiError } from '../../services/apiClient'
import type { CustomerAccount } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

/** Checks a { user } response against the API contract, so a mismatch fails loudly here. */
export function parseAccountResponse(data: unknown): CustomerAccount {
  const user = isRecord(data) && isRecord(data.user) ? data.user : null
  if (
    !user ||
    typeof user.id !== 'string' ||
    typeof user.firstName !== 'string' ||
    typeof user.lastName !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.countryCode !== 'string' ||
    !isOptionalString(user.companyName) ||
    !isOptionalString(user.telephone) ||
    (user.role !== 'customer' && user.role !== 'administrator') ||
    typeof user.emailVerified !== 'boolean' ||
    typeof user.createdAt !== 'string'
  ) {
    throw new ApiError(500, 'unexpected_response', 'Something went wrong on our side. Please try again.')
  }
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    countryCode: user.countryCode,
    companyName: user.companyName,
    telephone: user.telephone,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  }
}
