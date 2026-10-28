import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../services/apiClient'
import { clearCachedResponses } from '../../services/responseCache'
import { isHttpsUrl, isSitePath, slugify } from '../../utils/links'
import { reviewSearch } from '../request-review/reviewDecisions'
import { changeAuctionStatus, getAdminAuction, listAdminAuctions, listAllAuctions, parseAdminAuctionView } from './adminAuctionService'
import { listAdminCatalogues } from './adminCatalogueService'
import { parseAdminSummary } from './adminSummaryService'

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  apiRequest: vi.fn(),
}))
vi.mock('../../services/responseCache', () => ({ clearCachedResponses: vi.fn() }))

function sale(id: string, status = 'draft') {
  return {
    id,
    title: 'Sale',
    category: 'Glass',
    house: 'Maison Test',
    city: 'Paris',
    saleDate: '2026-12-07',
    saleTime: '15:00',
    lotCount: null,
    viewing: null,
    description: 'A sale.',
    image: null,
    featured: false,
    status,
    catalogues: [],
  }
}

function requestedPaths(): string[] {
  return vi.mocked(apiRequest).mock.calls.map(([path]) => path)
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  vi.mocked(clearCachedResponses).mockReset()
})

describe('admin auction service', () => {
  it.each([
    ['upcoming', 'status=published&period=upcoming'],
    ['completed', 'status=published&period=completed'],
    ['drafts', 'status=draft'],
    ['cancelled', 'status=cancelled'],
  ] as const)('lists the %s tab', async (view, filters) => {
    vi.mocked(apiRequest).mockResolvedValue({ auctions: [], total: 0, limit: 25, offset: 25 })
    await listAdminAuctions({ view, page: 2 })
    expect(requestedPaths()).toEqual([`/api/auctions?${filters}&limit=25&offset=25`])
  })

  it('reads the tab from the address, defaulting to upcoming', () => {
    expect(parseAdminAuctionView('drafts')).toBe('drafts')
    expect(parseAdminAuctionView('everything')).toBe('upcoming')
  })

  it('fetches every sale of every status, for choosing one in a form', async () => {
    vi.mocked(apiRequest).mockImplementation((path) => {
      const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset'))
      const count = offset === 0 ? 100 : 30
      return Promise.resolve({ auctions: Array.from({ length: count }, (_, index) => sale(`sale-${offset + index}`)), total: 130, limit: 100, offset })
    })
    expect(await listAllAuctions()).toHaveLength(130)
    expect(requestedPaths()).toEqual(['/api/auctions?status=all&limit=100&offset=0', '/api/auctions?status=all&limit=100&offset=100'])
  })

  it('finds drafts by id, and returns null for an unknown one', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ auction: sale('verrerie-2026-12') })
    await expect(getAdminAuction('verrerie-2026-12')).resolves.toMatchObject({ id: 'verrerie-2026-12', status: 'draft' })
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, 'auction_not_found', 'Not found'))
    await expect(getAdminAuction('missing')).resolves.toBeNull()
  })

  it('clears the public cache after a change, so the website shows it at once', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ auction: sale('verrerie-2026-12', 'published') })
    await changeAuctionStatus('verrerie-2026-12', 'published')
    expect(apiRequest).toHaveBeenCalledWith('/api/auctions/verrerie-2026-12', { method: 'PATCH', body: { status: 'published' } })
    expect(clearCachedResponses).toHaveBeenCalledTimes(1)
  })

  it('lists catalogues of sales in every status', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ catalogues: [], total: 0, limit: 25, offset: 0 })
    await listAdminCatalogues({ period: 'completed', page: 1 })
    expect(requestedPaths()).toEqual(['/api/catalogues?status=all&period=completed&limit=25&offset=0'])
  })
})

describe('dashboard summary', () => {
  it('reads the counts and refuses anything else', () => {
    const summary = {
      upcomingAuctions: 9,
      draftAuctions: 2,
      completedAuctions: 3,
      publishedCatalogues: 12,
      pendingRequests: 1,
      acceptedRequests: 6,
      placedBids: 0,
    }
    expect(parseAdminSummary({ summary })).toEqual(summary)
    expect(() => parseAdminSummary({ summary: { ...summary, pendingRequests: '1' } })).toThrow()
  })
})

describe('review filters in the address', () => {
  it('keeps the tab and filters, and leaves out what is empty', () => {
    expect(reviewSearch('all', { auction: 'verrerie-2026-12', customer: 'élodie' }, 2)).toBe(
      '?view=all&auction=verrerie-2026-12&customer=%C3%A9lodie&page=2',
    )
    expect(reviewSearch('pending', { auction: '', customer: '' })).toBe('?view=pending')
  })
})

describe('links', () => {
  it('makes readable ids from French titles', () => {
    expect(slugify('Œuvres d’art & objets de vitrine')).toBe('oeuvres-d-art-objets-de-vitrine')
  })

  it('accepts https addresses and paths on this site only', () => {
    expect(isHttpsUrl('https://example.com/catalogue.pdf')).toBe(true)
    expect(isHttpsUrl('http://example.com/catalogue.pdf')).toBe(false)
    expect(isHttpsUrl('https://user:secret@example.com/c.pdf')).toBe(false)
    expect(isSitePath('/images/sale.jpg')).toBe(true)
    expect(isSitePath('//other.example/sale.jpg')).toBe(false)
    expect(isSitePath('/\t/other.example/sale.jpg')).toBe(false)
  })
})
