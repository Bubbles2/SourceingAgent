import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '../../services/apiClient'
import { refreshSession } from '../auth/sessionStore'
import { submitBidRequest } from './bidRequestService'

vi.mock('../../services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/apiClient')>()),
  apiRequest: vi.fn(),
}))
vi.mock('../auth/sessionStore', () => ({ refreshSession: vi.fn() }))

const input = { auctionId: '1', lotId: '2', maxBidEur: 3000, instructions: '', acknowledgedCharges: true } as const

function failWith(error: ApiError): void {
  vi.mocked(apiRequest).mockRejectedValueOnce(error)
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  vi.mocked(refreshSession).mockReset()
})

describe('submitBidRequest', () => {
  it.each([
    ['lot_reserved', 409, 'lotId'],
    ['already_requested', 409, 'lotId'],
    ['lot_mismatch', 400, 'lotId'],
    ['sale_closed', 409, 'auctionId'],
  ])('shows %s next to the field it concerns', async (code, status, field) => {
    failWith(new ApiError(status, code, `Message for ${code}`))
    await expect(submitBidRequest(input)).resolves.toEqual({ ok: false, errors: { [field]: `Message for ${code}` } })
  })

  it('maps validation details to form fields', async () => {
    failWith(
      new ApiError(400, 'validation_failed', 'Invalid', [
        { path: 'body.maxBidEur', message: 'Enter a maximum bid of at least €20.' },
        { path: 'body.lotId', message: 'Choose the lot you want the agent to bid on.' },
      ]),
    )
    await expect(submitBidRequest(input)).resolves.toEqual({
      ok: false,
      errors: {
        maxBid: 'Enter a maximum bid of at least €20.',
        lotId: 'Choose the lot you want the agent to bid on.',
      },
    })
  })

  it.each(['email_not_verified', 'rate_limited', 'network_error', 'forbidden'])(
    'shows %s at the top of the form',
    async (code) => {
      failWith(new ApiError(403, code, `Message for ${code}`))
      await expect(submitBidRequest(input)).resolves.toEqual({ ok: false, errors: { form: `Message for ${code}` } })
      expect(refreshSession).not.toHaveBeenCalled()
    },
  )

  it('updates the header when the session has ended', async () => {
    failWith(new ApiError(401, 'unauthenticated', 'Sign in to continue.'))
    await expect(submitBidRequest(input)).resolves.toEqual({ ok: false, errors: { form: 'Sign in to continue.' } })
    expect(refreshSession).toHaveBeenCalledOnce()
  })

  it('lets unexpected failures through for the form to handle', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('bug'))
    await expect(submitBidRequest(input)).rejects.toThrow('bug')
  })

  it('posts the request and returns the saved one', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      request: {
        id: 'id-1',
        maxBidEur: '3000.00',
        instructions: '',
        status: 'pending',
        submittedAt: '2026-10-28T09:00:00.000Z',
        auction: { id: '1', title: 'Sale', startsAt: null, auctionDate: '2026-11-14', location: 'Paris' },
        lot: { id: '2', lotNumber: '45', title: '45 - Objet', titleUk: null },
      },
    })
    const result = await submitBidRequest(input)
    expect(apiRequest).toHaveBeenCalledWith('/api/bid-requests', { method: 'POST', body: input })
    expect(result).toMatchObject({ ok: true, request: { id: 'id-1', maxBidEur: 3000, status: 'pending' } })
  })
})
