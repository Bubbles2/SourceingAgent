import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../services/apiClient'
import { refreshSession } from '../auth/sessionStore'
import { formatChangeTime, parseReviewView } from './reviewDecisions'
import { parseReviewDetail, parseReviewPage } from './reviewResponses'
import { changeRequestStatus, getReviewDetail, listReviewRequests } from './reviewService'

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  apiRequest: vi.fn(),
}))
vi.mock('../auth/sessionStore', () => ({ refreshSession: vi.fn() }))

const apiRequestFromApi = {
  id: '6f1c2b0e-1d2a-4b8e-9a51-3c6f8e2d4a10',
  lotNumber: 45,
  maxBidEur: '6000.00',
  instructions: 'Only if unrestored.',
  status: 'pending',
  submittedAt: '2026-10-28T09:14:00.000Z',
  updatedAt: '2026-10-28T09:14:00.000Z',
  auction: {
    id: 'vauclair-tableaux-anciens-2026-11',
    title: 'Tableaux anciens & dessins',
    house: 'Maison Vauclair',
    city: 'Paris 9e',
    saleDate: '2026-11-14',
    saleTime: '14:00',
    status: 'published',
  },
  catalogue: { id: 'vauclair-tableaux-anciens', title: "Collection d'un amateur" },
  customer: {
    id: '0d6d3a7e-2a55-4d0f-8f34-5b8c1e9f7a21',
    firstName: 'Hugo',
    lastName: 'Lefèvre',
    email: 'hugo@example.com',
    companyName: null,
    countryCode: 'BE',
  },
  lotHeldByOther: false,
  nextStatuses: ['accepted', 'rejected', 'cancelled'],
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  vi.mocked(refreshSession).mockReset()
})

describe('review responses', () => {
  it('reads a page of requests, with amounts in whole euros', () => {
    const page = parseReviewPage({ requests: [apiRequestFromApi], total: 1, limit: 25, offset: 0 })
    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      lotNumber: 45,
      maxBidEur: 6000,
      customer: { firstName: 'Hugo', email: 'hugo@example.com', companyName: null },
      nextStatuses: ['accepted', 'rejected', 'cancelled'],
    })
  })

  it('reads a request with its history, including system changes with nobody named', () => {
    const detail = parseReviewDetail({
      request: apiRequestFromApi,
      history: [
        { fromStatus: null, toStatus: 'pending', changedAt: '2026-10-28T09:14:00.000Z', note: null, changedBy: { name: 'Hugo Lefèvre', role: 'customer' } },
        { fromStatus: 'pending', toStatus: 'rejected', changedAt: '2026-10-28T10:00:00.000Z', note: 'Withdrawn', changedBy: null },
      ],
    })
    expect(detail.history.map((change) => [change.fromStatus, change.toStatus, change.changedBy?.name ?? null])).toEqual([
      [null, 'pending', 'Hugo Lefèvre'],
      ['pending', 'rejected', null],
    ])
  })

  it.each([
    ['an unknown status', { ...apiRequestFromApi, status: 'approved' }],
    ['an unknown next step', { ...apiRequestFromApi, nextStatuses: ['approved'] }],
    ['an amount that is not a decimal string', { ...apiRequestFromApi, maxBidEur: 6000 }],
    ['a request without its customer', { ...apiRequestFromApi, customer: undefined }],
  ])('refuses %s', (_case, broken) => {
    expect(() => parseReviewPage({ requests: [broken], total: 1, limit: 25, offset: 0 })).toThrow('Something went wrong on our side')
  })
})

describe('reviewService', () => {
  it('asks for the statuses of the chosen tab, a page at a time', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ requests: [], total: 0, limit: 25, offset: 25 })
    await listReviewRequests({ view: 'closed', page: 2 })
    expect(apiRequest).toHaveBeenCalledWith('/api/admin/bid-requests?status=rejected%2Ccancelled%2Cwon%2Clost&limit=25&offset=25')
  })

  it('sends the status the administrator saw along with the new one', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ request: { ...apiRequestFromApi, status: 'accepted', nextStatuses: ['placed', 'cancelled'] } })
    const result = await changeRequestStatus(apiRequestFromApi.id, { from: 'pending', to: 'accepted', note: 'Checked.' })
    expect(apiRequest).toHaveBeenCalledWith(`/api/admin/bid-requests/${apiRequestFromApi.id}/status-changes`, {
      method: 'POST',
      body: { from: 'pending', to: 'accepted', note: 'Checked.' },
    })
    expect(result).toMatchObject({ ok: true, request: { status: 'accepted' } })
  })

  it("passes on the API's reason when a change is refused", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(409, 'lot_reserved', 'Another request already reserves this lot.'))
    await expect(changeRequestStatus('id', { from: 'pending', to: 'accepted', note: '' })).resolves.toEqual({
      ok: false,
      code: 'lot_reserved',
      message: 'Another request already reserves this lot.',
    })

    vi.mocked(apiRequest).mockRejectedValueOnce(
      new ApiError(400, 'validation_failed', 'Invalid', [{ path: 'body.note', message: 'Keep the note to 1,000 characters or fewer.' }]),
    )
    await expect(changeRequestStatus('id', { from: 'pending', to: 'accepted', note: 'x' })).resolves.toMatchObject({
      message: 'Keep the note to 1,000 characters or fewer.',
    })
  })

  it('lets the header catch up when the administrator was signed out or lost the role', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(403, 'forbidden', 'You do not have permission to do that.'))
    await changeRequestStatus('id', { from: 'pending', to: 'accepted', note: '' })
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it("reports a request that can't be loaded instead of failing the page", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, 'bid_request_not_found', 'No bid request was found with this id.'))
    await expect(getReviewDetail('missing')).resolves.toEqual({ ok: false, message: 'No bid request was found with this id.' })
  })
})

describe('review helpers', () => {
  it('reads the tab from the address, defaulting to pending review', () => {
    expect(parseReviewView('placed')).toBe('placed')
    expect(parseReviewView('everything')).toBe('pending')
    expect(parseReviewView(null)).toBe('pending')
  })

  it('shows change times in Paris time', () => {
    // 09:14 UTC is 10:14 in Paris in late October (winter time starts on the 25th)
    expect(formatChangeTime('2026-10-28T09:14:00.000Z')).toBe('28 Oct 2026, 10:14')
    expect(formatChangeTime('2026-07-14T22:30:00.000Z')).toBe('15 Jul 2026, 00:30')
  })
})
