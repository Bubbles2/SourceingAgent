import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../src/services/apiClient'
import { isFailure, parseSiteSearch, reasonText, readSearchMode, searchLots } from './siteSearch'

vi.mock('../../src/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiClient')>()),
  apiRequest: vi.fn(),
}))

const request = vi.mocked(apiRequest)

const lot = {
  id: '6928', auctionId: '42', externalId: '35448750', lotNumber: '12', title: 'Commode d’époque Louis XIV', description: null,
  category: 'Furniture', maker: null, materials: [], estimateLow: null, estimateHigh: null, currency: 'EUR',
  imageUrl: null, sourceUrl: 'https://drouot.com/en/l/35448750', titleUk: 'Louis XIV period commode', descriptionUk: null,
  aiCategory: null, aiSummary: null,
  auction: { id: '42', title: 'Mobilier et objets d’art', startsAt: '2026-11-05T13:00:00.000Z', auctionDate: '2026-11-05', location: 'Osenat' },
}

const labels = { 'period.louis_xiv': 'Louis XIV period', 'furniture.case_furniture.commodes': 'Commodes', furniture: 'Furniture' }

beforeEach(() => request.mockReset())

describe('site search', () => {
  it('turns explanations into words', () => {
    expect(reasonText('taxonomy: period.louis_xiv dated_to', labels)).toBe('Louis XIV period (period)')
    expect(reasonText('taxonomy: furniture.case_furniture.commodes classified_as, furniture classified_as', labels)).toBe('Commodes · Furniture')
    expect(reasonText("keyword: 'mobilier'", labels)).toBe('Text mentions “mobilier”')
    expect(reasonText('semantic similarity 0.72', labels)).toBe('Similar description')
    expect(reasonText('related concept style.french_baroque (broader_style)', labels)).toBe('Related to French baroque')
    expect(reasonText('something new', labels)).toBeNull()
  })

  it('reads the results as the site’s own lots', () => {
    const result = parseSiteSearch({
      query: 'Louis XIV furniture', mode: 'broad', taxonomyScope: 'draft', totalDirect: 1, totalRelated: 0,
      understanding: { ideas: [{ text: 'Louis XIV', concepts: ['period.louis_xiv'] }], unresolvedTerms: [] },
      labels,
      direct: [{ ...lot, saleOpen: false, matchType: 'direct', explanation: ['taxonomy: period.louis_xiv dated_to', 'taxonomy: period.louis_xiv dated_to'] }],
      related: [],
    })
    expect(result.ideas).toEqual([{ text: 'Louis XIV', labels: ['Louis XIV period'] }])
    expect(result.direct[0]).toMatchObject({ saleOpen: false, matchType: 'direct', reasons: ['Louis XIV period (period)'] })
    expect(result.direct[0].lot.auction.id).toBe('42')
  })

  it('sends the mode only when one is chosen', async () => {
    request.mockResolvedValue({ query: 'x', mode: 'broad', taxonomyScope: 'draft', totalDirect: 0, totalRelated: 0, understanding: { ideas: [], unresolvedTerms: [] }, labels: {}, direct: [], related: [] })
    await searchLots('shoes')
    expect(request).toHaveBeenLastCalledWith('/api/search?q=shoes')
    await searchLots('shoes', 'exact')
    expect(request).toHaveBeenLastCalledWith('/api/search?q=shoes&mode=exact')
    expect(readSearchMode('fast')).toBeUndefined()
  })

  it('keeps search problems on the search page', async () => {
    request.mockRejectedValueOnce(new ApiError(503, 'search_unavailable', 'The search service is not running.'))
    const outcome = await searchLots('shoes')
    expect(isFailure(outcome) && outcome.message).toBe('The search service is not running.')
    request.mockRejectedValueOnce(new ApiError(401, 'unauthenticated', 'Sign in'))
    await expect(searchLots('shoes')).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})
