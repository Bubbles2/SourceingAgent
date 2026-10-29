import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../services/apiClient'
import { clearCachedResponses } from '../../services/responseCache'
import { getAuction, listAuctions, listAuctionsBetween, listFeaturedAuctions } from './auctionService'

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  apiRequest: vi.fn(),
}))

function sale(id: string) {
  return {
    id,
    externalId: `external-${id}`,
    title: 'Sale',
    startsAt: '2026-11-14T13:00:00.000Z',
    endsAt: null,
    auctionDate: '2026-11-14',
    location: 'Paris',
    catalogueUrl: null,
    sourceUrl: null,
    status: null,
    lotCount: 0,
  }
}

/** Answers like the API: `total` sales, served in pages */
function serveSales(total: number): void {
  vi.mocked(apiRequest).mockImplementation((path) => {
    const search = new URL(path, 'http://localhost').searchParams
    const limit = Number(search.get('limit') ?? 24)
    const offset = Number(search.get('offset') ?? 0)
    const count = Math.max(0, Math.min(limit, total - offset))
    const auctions = Array.from({ length: count }, (_, index) => sale(String(offset + index + 1)))
    return Promise.resolve({ auctions, total, limit, offset })
  })
}

function requestedPaths(): string[] {
  return vi.mocked(apiRequest).mock.calls.map(([path]) => path)
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  clearCachedResponses()
})

describe('auctionService', () => {
  it('asks for one page of upcoming or completed sales', async () => {
    serveSales(30)
    const page = await listAuctions({ status: 'completed', page: 3 })
    expect(requestedPaths()).toEqual(['/api/auctions?period=completed&limit=12&offset=24'])
    expect(page.items.map((auction) => auction.id)).toEqual(['25', '26', '27', '28', '29', '30'])
    expect(page.total).toBe(30)
  })

  it('asks for the next three upcoming sales', async () => {
    serveSales(3)
    await listFeaturedAuctions()
    expect(requestedPaths()).toEqual(['/api/auctions?period=upcoming&limit=3'])
  })

  it("fetches every page of a calendar range, the later pages together", async () => {
    serveSales(250)
    const auctions = await listAuctionsBetween({ from: '2026-10-26', to: '2026-12-06' })
    expect(auctions).toHaveLength(250)
    expect(requestedPaths()).toEqual([
      '/api/auctions?from=2026-10-26&to=2026-12-06&limit=100&offset=0',
      '/api/auctions?from=2026-10-26&to=2026-12-06&limit=100&offset=100',
      '/api/auctions?from=2026-10-26&to=2026-12-06&limit=100&offset=200',
    ])
  })

  it('reuses a recent answer instead of asking again', async () => {
    serveSales(5)
    await listAuctions({ status: 'upcoming', page: 1 })
    await listAuctions({ status: 'upcoming', page: 1 })
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })

  it('returns null for a sale that does not exist, and passes other failures on', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, 'auction_not_found', 'Not found'))
    await expect(getAuction('999')).resolves.toBeNull()

    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(503, 'service_unavailable', 'Down'))
    await expect(getAuction('1')).rejects.toThrow('Down')
  })

  it('never asks for an id that cannot be a sale', async () => {
    await expect(getAuction('odd/../id')).resolves.toBeNull()
    await expect(getAuction('0')).resolves.toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
