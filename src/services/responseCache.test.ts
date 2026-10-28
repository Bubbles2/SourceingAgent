import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from './apiClient'
import { cacheMaxAgeMs, cachedGet, clearCachedResponses } from './responseCache'

vi.mock('./apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./apiClient')>()),
  apiRequest: vi.fn(),
}))

const parse = (data: unknown) => ({ data })

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(apiRequest).mockReset()
  clearCachedResponses()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cachedGet', () => {
  it('shares one request between simultaneous callers', async () => {
    vi.mocked(apiRequest).mockResolvedValue('sales')
    const [first, second] = await Promise.all([cachedGet('/api/auctions', parse), cachedGet('/api/auctions', parse)])
    expect(first).toEqual({ data: 'sales' })
    expect(second).toEqual({ data: 'sales' })
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('reuses a response for a minute, then asks again', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce('first').mockResolvedValueOnce('second')
    await cachedGet('/api/auctions', parse)
    vi.advanceTimersByTime(cacheMaxAgeMs - 1)
    await expect(cachedGet('/api/auctions', parse)).resolves.toEqual({ data: 'first' })
    vi.advanceTimersByTime(1)
    await expect(cachedGet('/api/auctions', parse)).resolves.toEqual({ data: 'second' })
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })

  it('keeps different addresses apart', async () => {
    vi.mocked(apiRequest).mockImplementation((path) => Promise.resolve(path))
    await expect(cachedGet('/api/auctions?period=upcoming', parse)).resolves.toEqual({ data: '/api/auctions?period=upcoming' })
    await expect(cachedGet('/api/auctions?period=completed', parse)).resolves.toEqual({ data: '/api/auctions?period=completed' })
  })

  it('forgets a failed request, so the next visit tries again', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(503, 'service_unavailable', 'Down')).mockResolvedValueOnce('sales')
    await expect(cachedGet('/api/auctions', parse)).rejects.toThrow('Down')
    await expect(cachedGet('/api/auctions', parse)).resolves.toEqual({ data: 'sales' })
  })

  it('forgets everything when the session changes', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce('as visitor').mockResolvedValueOnce('as administrator')
    await cachedGet('/api/auctions/sale', parse)
    clearCachedResponses()
    await expect(cachedGet('/api/auctions/sale', parse)).resolves.toEqual({ data: 'as administrator' })
  })
})
