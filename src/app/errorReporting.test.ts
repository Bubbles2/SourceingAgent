import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isAccessError } from '../services/apiClient'
import { reportCaughtError } from './errorReporting'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('error reporting', () => {
  it('recognises the API refusing a signed-out visitor or a customer', () => {
    expect(isAccessError(new ApiError(401, 'unauthenticated', 'Sign in to continue.'))).toBe(true)
    expect(isAccessError(new ApiError(403, 'forbidden', 'You do not have permission to do that.'))).toBe(true)
    expect(isAccessError(new ApiError(403, 'csrf_invalid', 'Refresh the page and try again.'))).toBe(false)
    expect(isAccessError(new ApiError(503, 'service_unavailable', 'Unavailable'))).toBe(false)
    expect(isAccessError(new Error('unauthenticated'))).toBe(false)
  })

  it('logs real failures with where they happened, but not expected refusals', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportCaughtError(new ApiError(401, 'unauthenticated', 'Sign in to continue.'), { componentStack: '\n    at SummaryCards' })
    expect(log).not.toHaveBeenCalled()

    const bug = new TypeError('Cannot read properties of undefined')
    reportCaughtError(bug, { componentStack: '\n    at SummaryCards' })
    expect(log).toHaveBeenCalledWith(bug, '\n    at SummaryCards')
  })
})
