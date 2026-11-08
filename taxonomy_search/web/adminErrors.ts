import { refreshSession } from '../../src/features/auth/sessionStore'
import { ApiError, isAccessError } from '../../src/services/apiClient'

/** A message that is safe to show; an ended session also refreshes the header. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAccessError(error)) void refreshSession()
  return error instanceof ApiError ? error.message : fallback
}
