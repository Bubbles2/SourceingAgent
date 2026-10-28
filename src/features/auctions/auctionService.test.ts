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
    title: 'Sale',
    category: 'Fine art',
    house: 'Maison Test',
    city: 'Paris',
    saleDate: '2026-11-14',
    saleTime: '14:00',
    lotCount: null,
    viewing: null,
    description: 'A sale.',
    image: null,
    featured: false,
    status: 'published',
    catalogues: [],
  }
}

/** Answers like the API: `total` sales, served in pages */
function serveSales(total: number): void {
  vi.mocked(apiRequest).mockImplementation((path) => {
    const search = new URL(path, 'http://localhost').searchParams
    const limit = Number(search.get('limit') ?? 24)
    const offset = Number(search.get('offset') ?? 0)
    const count = Math.max(0, Math.min(limit, total - offset))
    const auctions = Array.from({ length: count }, (_, index) => sale(`sale-${offset + index}`))
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
    expect(page.items.map((auction) => auction.id)).toEqual(['sale-24', 'sale-25', 'sale-26', 'sale-27', 'sale-28', 'sale-29'])
    expect(page.total).toBe(30)
  })

  it('asks for the next three featured sales', async () => {
    serveSales(3)
    await listFeaturedAuctions()
    expect(requestedPaths()).toEqual(['/api/auctions?period=upcoming&featured=true&limit=3'])
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

  it('returns null for a sale that is not published, and passes other failures on', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, 'auction_not_found', 'Not found'))
    await expect(getAuction('draft-sale')).resolves.toBeNull()

    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(503, 'service_unavailable', 'Down'))
    await expect(getAuction('a-sale')).rejects.toThrow('Down')
  })

  it('escapes the id in the address', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ auction: sale('odd') })
    await getAuction('odd/../id')
    expect(requestedPaths()).toEqual(['/api/auctions/odd%2F..%2Fid'])
  })
})
