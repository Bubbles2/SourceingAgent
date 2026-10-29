// The agent's review of bid requests: permissions, the status workflow and its audit trail, lot
// reservations under simultaneous approvals, and what customers can and can't see. Runs against the
// real app and local database; everything uses reviewtest-<run>-… ids and emails and is removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { deleteTestData, insertTestSale, type TestSale } from '../src/cli/testSales.ts'
import { closePool, pool, withTransaction } from '../src/db/pool.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const run = randomUUID().slice(0, 8)
const prefix = `reviewtest-${run}`
const statuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const

const reviewRequest = z.strictObject({
  id: z.uuid(),
  maxBidEur: z.string(),
  instructions: z.string(),
  status: z.enum(statuses),
  submittedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  auction: z.strictObject({
    id: z.string(),
    title: z.string(),
    startsAt: z.iso.datetime().nullable(),
    auctionDate: z.iso.date().nullable(),
    location: z.string().nullable(),
  }),
  lot: z.strictObject({ id: z.string(), lotNumber: z.string().nullable(), title: z.string().nullable(), titleUk: z.string().nullable() }),
  customer: z.strictObject({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    companyName: z.string().nullable(),
    countryCode: z.string(),
  }),
  lotHeldByOther: z.boolean(),
  nextStatuses: z.array(z.enum(statuses)),
})
const reviewPage = z.strictObject({ requests: z.array(reviewRequest), total: z.number(), limit: z.number(), offset: z.number() })
const reviewDetail = z.strictObject({
  request: reviewRequest,
  history: z.array(
    z.strictObject({
      fromStatus: z.enum(statuses).nullable(),
      toStatus: z.enum(statuses),
      changedAt: z.iso.datetime(),
      note: z.string().nullable(),
      changedBy: z.strictObject({ name: z.string(), role: z.string() }).nullable(),
    }),
  ),
})
const errorBody = z.object({ error: z.object({ code: z.string(), details: z.array(z.object({ path: z.string() })).optional() }) })

function errorCode(response: ApiResponse): string {
  return errorBody.parse(response.body).error.code
}

let server: TestServer
let admin: BrowserClient
let alice: BrowserClient
let bob: BrowserClient
let aliceId: string

const sales: Record<'open' | 'results' | 'closed', TestSale> = {
  open: { auctionId: '', lots: [] },
  results: { auctionId: '', lots: [] },
  closed: { auctionId: '', lots: [] },
}

/** The id of a lot, by its number in the sale */
function lotId(sale: TestSale, lotNumber: number): string {
  const lot = sale.lots.find((candidate) => candidate.lotNumber === String(lotNumber))
  assert.ok(lot, `no lot ${lotNumber}`)
  return lot.id
}

async function register(label: string, role: 'customer' | 'administrator'): Promise<{ client: BrowserClient; id: string }> {
  const client = new BrowserClient(server.baseUrl)
  const response = await client.post('/api/auth/register', {
    firstName: 'Test',
    lastName: label,
    email: `${prefix}-${label}@example.com`,
    password: 'correct horse battery staple',
    countryCode: 'FR',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  const id = z.object({ user: z.object({ id: z.string() }).loose() }).parse(response.body).user.id
  await pool.query('UPDATE users SET role = $2, email_verified_at = now() WHERE id = $1', [id, role])
  return { client, id }
}

/** Submits a request as a customer and returns its id */
async function submit(customer: BrowserClient, lotNumber: number, sale = sales.open): Promise<string> {
  const response = await customer.post('/api/bid-requests', {
    auctionId: sale.auctionId,
    lotId: lotId(sale, lotNumber),
    maxBidEur: 2500,
    instructions: 'Only if the frame is original.',
    acknowledgedCharges: true,
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return z.object({ request: z.object({ id: z.string() }).loose() }).parse(response.body).request.id
}

function change(id: string, from: string, to: string, note?: string, client = admin): Promise<ApiResponse> {
  return client.post(`/api/admin/bid-requests/${id}/status-changes`, { from, to, ...(note === undefined ? {} : { note }) })
}

/** Makes a change that must succeed and returns the updated request */
async function moveTo(id: string, from: string, to: string, note?: string) {
  const response = await change(id, from, to, note)
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return z.object({ request: reviewRequest }).parse(response.body).request
}

async function detail(id: string) {
  const response = await admin.get(`/api/admin/bid-requests/${id}`)
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return reviewDetail.parse(response.body)
}

async function acceptedCount(sale: TestSale, lotNumber: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM bid_requests WHERE lot_id = $1 AND status = 'accepted'",
    [lotId(sale, lotNumber)],
  )
  return rows[0]?.count ?? 0
}

before(async () => {
  server = await startTestServer(createApp())
  admin = (await register('admin', 'administrator')).client
  const signedIn = await register('alice', 'customer')
  alice = signedIn.client
  aliceId = signedIn.id
  bob = (await register('bob', 'customer')).client
  sales.open = await insertTestSale(`${prefix}-open`, { daysAhead: 30, lotCount: 40 }, pool)
  sales.results = await insertTestSale(`${prefix}-results`, { daysAhead: 30, lotCount: 10 }, pool)
  sales.closed = await insertTestSale(`${prefix}-closed`, { daysAhead: -10, lotCount: 20 }, pool)
})

after(async () => {
  await server.close()
  await withTransaction((client) => deleteTestData(prefix, client))
  await closePool()
})

describe('who can review requests', () => {
  test('only administrators can list, read or change requests', async () => {
    const id = await submit(alice, 1)
    const visitor = new BrowserClient(server.baseUrl)
    assert.equal((await visitor.get('/api/admin/bid-requests')).status, 401)
    assert.equal((await visitor.post(`/api/admin/bid-requests/${id}/status-changes`, { from: 'pending', to: 'accepted' })).status, 401)
    for (const customer of [alice, bob]) {
      assert.equal((await customer.get('/api/admin/bid-requests')).status, 403)
      assert.equal((await customer.get(`/api/admin/bid-requests/${id}`)).status, 403)
      assert.equal((await change(id, 'pending', 'accepted', undefined, customer)).status, 403)
    }
    const noToken = await admin.post(`/api/admin/bid-requests/${id}/status-changes`, { from: 'pending', to: 'accepted' }, { csrf: false })
    assert.equal(errorCode(noToken), 'csrf_invalid')
    assert.equal((await detail(id)).request.status, 'pending', 'nothing changed')
  })
})

describe('the review queue', () => {
  test('lists pending requests by default, with the customer, the amount and the possible next steps', async () => {
    const id = await submit(alice, 2)
    const page = reviewPage.parse((await admin.get('/api/admin/bid-requests?limit=100')).body)
    assert.ok(page.requests.every((request) => request.status === 'pending'))
    const ours = page.requests.find((request) => request.id === id)
    assert.ok(ours, 'the new request is in the queue')
    assert.equal(ours.customer.email, `${prefix}-alice@example.com`)
    assert.equal(ours.maxBidEur, '2500.00')
    assert.equal(ours.instructions, 'Only if the frame is original.')
    assert.deepEqual(ours.nextStatuses, ['accepted', 'rejected', 'cancelled'])
  })

  test('filters by one or more statuses, and checks the filter', async () => {
    const id = await submit(alice, 3)
    await moveTo(id, 'pending', 'rejected', 'Lot withdrawn by the house.')
    const closed = reviewPage.parse((await admin.get('/api/admin/bid-requests?status=rejected,cancelled&limit=100')).body)
    assert.ok(closed.requests.some((request) => request.id === id))
    assert.ok(closed.requests.every((request) => ['rejected', 'cancelled'].includes(request.status)))

    assert.equal((await admin.get('/api/admin/bid-requests?status=postponed')).status, 400)
    assert.equal((await admin.get('/api/admin/bid-requests?status=')).status, 400)
  })

  test('shows a request with its audit trail, starting with its submission', async () => {
    const id = await submit(alice, 4)
    const { request, history } = await detail(id)
    assert.equal(request.id, id)
    assert.equal(history.length, 1)
    assert.equal(history[0]?.fromStatus, null)
    assert.equal(history[0]?.toStatus, 'pending')
    assert.deepEqual(history[0]?.changedBy, { name: 'Test alice', role: 'customer' })

    assert.equal((await admin.get(`/api/admin/bid-requests/${randomUUID()}`)).status, 404)
    assert.equal((await admin.get('/api/admin/bid-requests/not-a-uuid')).status, 404)
  })
})

describe('status transitions', () => {
  test('pending, accepted, bid placed, won: each step is recorded with who made it and why', async () => {
    const id = await submit(alice, 5, sales.results)
    const accepted = await moveTo(id, 'pending', 'accepted', 'Condition report checked.')
    assert.deepEqual(accepted.nextStatuses, ['placed', 'cancelled'])
    const placed = await moveTo(id, 'accepted', 'placed', 'Bid left with the auctioneer.')
    assert.deepEqual(placed.nextStatuses, [], 'no result before the sale starts')

    const early = await change(id, 'placed', 'won')
    assert.equal(early.status, 409)
    assert.equal(errorCode(early), 'sale_not_started')

    await pool.query("UPDATE auctions SET starts_at = now() - interval '1 minute' WHERE id = $1", [sales.results.auctionId])
    const won = await moveTo(id, 'placed', 'won', 'Hammer at 2,200 €.')
    assert.deepEqual(won.nextStatuses, [])

    const { history } = await detail(id)
    assert.deepEqual(
      history.map((entry) => [entry.fromStatus, entry.toStatus, entry.note, entry.changedBy?.role]),
      [
        [null, 'pending', null, 'customer'],
        ['pending', 'accepted', 'Condition report checked.', 'administrator'],
        ['accepted', 'placed', 'Bid left with the auctioneer.', 'administrator'],
        ['placed', 'won', 'Hammer at 2,200 €.', 'administrator'],
      ],
    )
  })

  test('a placed bid can be lost; pending requests can be rejected or cancelled; accepted ones cancelled', async () => {
    const lost = await submit(alice, 6, sales.results)
    await moveTo(lost, 'pending', 'accepted')
    await moveTo(lost, 'accepted', 'placed')
    assert.equal((await moveTo(lost, 'placed', 'lost')).status, 'lost')

    assert.equal((await moveTo(await submit(alice, 7), 'pending', 'rejected')).status, 'rejected')
    assert.equal((await moveTo(await submit(alice, 8), 'pending', 'cancelled')).status, 'cancelled')
    const accepted = await submit(alice, 9)
    await moveTo(accepted, 'pending', 'accepted')
    assert.equal((await moveTo(accepted, 'accepted', 'cancelled')).status, 'cancelled')
  })

  test('steps out of order, and changes to final requests, are refused', async () => {
    const pending = await submit(alice, 10)
    for (const to of ['placed', 'won', 'lost', 'pending']) {
      const response = await change(pending, 'pending', to)
      assert.equal(response.status, 409, to)
      assert.equal(errorCode(response), 'invalid_status_change', to)
    }
    await moveTo(pending, 'pending', 'rejected')
    for (const to of ['accepted', 'pending', 'cancelled']) {
      assert.equal(errorCode(await change(pending, 'rejected', to)), 'invalid_status_change', to)
    }
    assert.equal((await detail(pending)).request.status, 'rejected')
  })

  test('a change made from an out-of-date status is refused', async () => {
    const id = await submit(alice, 11)
    const stale = await change(id, 'accepted', 'placed')
    assert.equal(stale.status, 409)
    assert.equal(errorCode(stale), 'status_changed')
    assert.equal((await detail(id)).history.length, 1, 'nothing was recorded')
  })

  test('the change itself is checked', async () => {
    const id = await submit(alice, 12)
    assert.equal((await change(id, 'pending', 'approved')).status, 400)
    assert.equal((await change(id, 'pending', 'accepted', 'x'.repeat(1001))).status, 400)
    assert.equal((await admin.post(`/api/admin/bid-requests/${id}/status-changes`, { from: 'pending', to: 'accepted', by: 'x' })).status, 400)
    assert.equal((await change(randomUUID(), 'pending', 'accepted')).status, 404)
    assert.equal((await change('not-a-uuid', 'pending', 'accepted')).status, 404)
  })

  test('requests for a sale that is over, or that the monitor moves into the past, cannot be accepted', async () => {
    // Requests can't be submitted for a past sale, so this one is written straight to the database.
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO bid_requests (customer_id, auction_id, lot_id, max_bid_eur) VALUES ($1, $2, $3, 500) RETURNING id',
      [aliceId, sales.closed.auctionId, lotId(sales.closed, 13)],
    )
    const closedId = rows[0]?.id ?? ''
    assert.deepEqual((await detail(closedId)).request.nextStatuses, ['rejected', 'cancelled'])
    assert.equal(errorCode(await change(closedId, 'pending', 'accepted')), 'sale_closed')

    const id = await submit(alice, 14)
    await pool.query("UPDATE auctions SET starts_at = starts_at - interval '40 days' WHERE id = $1", [sales.open.auctionId])
    try {
      assert.equal(errorCode(await change(id, 'pending', 'accepted')), 'sale_closed')
    } finally {
      await pool.query("UPDATE auctions SET starts_at = starts_at + interval '40 days' WHERE id = $1", [sales.open.auctionId])
    }
  })
})

describe('lot reservations', () => {
  test('pending requests do not reserve a lot; the accepted one does, without revealing who or how much', async () => {
    const aliceRequest = await submit(alice, 20)
    const bobRequest = await submit(bob, 20)
    await moveTo(aliceRequest, 'pending', 'accepted')

    const bobs = (await detail(bobRequest)).request
    assert.equal(bobs.lotHeldByOther, true)
    assert.deepEqual(bobs.nextStatuses, ['rejected', 'cancelled'])
    const refused = await change(bobRequest, 'pending', 'accepted')
    assert.equal(refused.status, 409)
    assert.equal(errorCode(refused), 'lot_reserved')

    const response = await new BrowserClient(server.baseUrl).get('/api/requested-lots')
    const text = JSON.stringify(response.body)
    assert.ok(text.includes(`"auction":{"id":"${sales.open.auctionId}"`))
    assert.ok(!text.includes('2500') && !text.includes(aliceId) && !text.includes('alice'))
  })

  test('simultaneous approvals of competing requests reserve each lot exactly once', async () => {
    for (const lot of [21, 22, 23]) {
      const requests = [await submit(alice, lot), await submit(bob, lot)]
      const responses = await Promise.all(requests.map((id) => change(id, 'pending', 'accepted')))
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [201, 409],
        `lot ${lot}: ${responses.map((response) => JSON.stringify(response.body)).join(' / ')}`,
      )
      const refused = responses.find((response) => response.status === 409)
      assert.ok(refused && errorCode(refused) === 'lot_reserved')
      assert.equal(await acceptedCount(sales.open, lot), 1, `lot ${lot}`)
    }
  })

  test('even when two acceptances both get past every check, the database keeps only one', async () => {
    const first = await submit(alice, 26)
    const second = await submit(bob, 26)
    const [one, two] = [await pool.connect(), await pool.connect()]
    try {
      await one.query('BEGIN')
      await two.query('BEGIN')
      await one.query("UPDATE bid_requests SET status = 'accepted' WHERE id = $1", [first])
      // The second acceptance waits on the first's uncommitted reservation, then fails once it commits.
      const blocked = two.query("UPDATE bid_requests SET status = 'accepted' WHERE id = $1", [second]).then(
        () => null,
        (error: unknown) => error,
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      await one.query('COMMIT')
      const error = await blocked
      assert.equal(Reflect.get(Object(error), 'code'), '23505')
      assert.equal(Reflect.get(Object(error), 'constraint'), 'bid_requests_one_reserving_request_per_lot')
      await two.query('ROLLBACK')
    } finally {
      one.release()
      two.release()
    }
    assert.equal(await acceptedCount(sales.open, 26), 1)
  })

  test('two decisions on the same request at once: the first applies, the second is refused', async () => {
    const id = await submit(alice, 24)
    const responses = await Promise.all([change(id, 'pending', 'accepted'), change(id, 'pending', 'rejected')])
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
    const refused = responses.find((response) => response.status === 409)
    assert.ok(refused && errorCode(refused) === 'status_changed')
    assert.equal((await detail(id)).history.length, 2, 'one submission and one decision')
  })

  test('cancelling an accepted request frees the lot for someone else', async () => {
    const aliceRequest = await submit(alice, 25)
    await moveTo(aliceRequest, 'pending', 'accepted')
    assert.equal(errorCode(await bob.post('/api/bid-requests', {
      auctionId: sales.open.auctionId,
      lotId: lotId(sales.open, 25),
      maxBidEur: 900,
      instructions: '',
      acknowledgedCharges: true,
    })), 'lot_reserved')

    await moveTo(aliceRequest, 'accepted', 'cancelled', 'Customer changed their mind.')
    const bobRequest = await submit(bob, 25)
    assert.equal((await moveTo(bobRequest, 'pending', 'accepted')).status, 'accepted')
  })
})

describe("customers' own requests", () => {
  test('customers see only their own requests and statuses, never the review notes', async () => {
    const id = await submit(alice, 30)
    await moveTo(id, 'pending', 'rejected', 'Internal: estimate too low for this client.')

    const own = await alice.get('/api/bid-requests')
    const requests = z.object({ requests: z.array(z.object({ id: z.string(), status: z.string() }).loose()) }).parse(own.body).requests
    assert.equal(requests.find((request) => request.id === id)?.status, 'rejected')
    assert.ok(!JSON.stringify(own.body).includes('Internal:'))

    const bobs = z.object({ requests: z.array(z.object({ id: z.string() }).loose()) }).parse((await bob.get('/api/bid-requests')).body)
    assert.ok(bobs.requests.every((request) => request.id !== id), "Alice's request is not in Bob's list")
  })
})
