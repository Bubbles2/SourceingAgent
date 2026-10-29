// The administration area's API: every protected operation refuses visitors and customers, the
// dashboard counts, and the bid request filters. Runs against the real app and local database;
// everything uses admintest-<run>-… ids and emails and is removed afterwards.
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
const prefix = `admintest-${run}`

const summaryBody = z.object({
  summary: z.strictObject({
    upcomingAuctions: z.number(),
    completedAuctions: z.number(),
    upcomingLots: z.number(),
    pendingRequests: z.number(),
    acceptedRequests: z.number(),
    placedBids: z.number(),
  }),
})
const requestList = z.object({
  requests: z.array(
    z.object({ id: z.string(), status: z.string(), auction: z.object({ id: z.string() }).loose(), customer: z.object({ email: z.string() }).loose() }).loose(),
  ),
  total: z.number(),
})

let server: TestServer
let admin: BrowserClient
let customer: BrowserClient
let visitor: BrowserClient
const sales = new Map<string, TestSale>()

async function register(label: string, role: 'customer' | 'administrator', names = { firstName: 'Test', lastName: label }): Promise<BrowserClient> {
  const client = new BrowserClient(server.baseUrl)
  const response = await client.post('/api/auth/register', {
    ...names,
    email: `${prefix}-${label}@example.com`,
    password: 'correct horse battery staple',
    countryCode: 'FR',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  await pool.query('UPDATE users SET role = $2, email_verified_at = now() WHERE email = $1', [`${prefix}-${label}@example.com`, role])
  return client
}

async function createSale(label: string, daysAhead: number, lotCount = 20): Promise<TestSale> {
  const sale = await insertTestSale(`${prefix}-${label}`, { daysAhead, lotCount }, pool)
  sales.set(label, sale)
  return sale
}

/** A sale's database id, by its label */
function saleId(label: string): string {
  const sale = sales.get(label)
  assert.ok(sale, `no sale ${label}`)
  return sale.auctionId
}

async function submit(client: BrowserClient, label: string, lotNumber: number): Promise<string> {
  const lot = sales.get(label)?.lots.find((candidate) => candidate.lotNumber === String(lotNumber))
  assert.ok(lot, `no lot ${lotNumber} in ${label}`)
  const response = await client.post('/api/bid-requests', {
    auctionId: saleId(label),
    lotId: lot.id,
    maxBidEur: 500,
    instructions: '',
    acknowledgedCharges: true,
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return z.object({ request: z.object({ id: z.string() }).loose() }).parse(response.body).request.id
}

async function summary(): Promise<z.infer<typeof summaryBody>['summary']> {
  const response = await admin.get('/api/admin/summary')
  assert.equal(response.status, 200)
  return summaryBody.parse(response.body).summary
}

function listRequests(query: string): Promise<ApiResponse> {
  return admin.get(`/api/admin/bid-requests?${query}&limit=100`)
}

before(async () => {
  server = await startTestServer(createApp())
  visitor = new BrowserClient(server.baseUrl)
  admin = await register('admin', 'administrator')
  customer = await register('customer', 'customer', { firstName: 'Élodie', lastName: 'Marchand' })
  await createSale('one', 20)
  await createSale('two', 25)
})

after(async () => {
  await server.close()
  await withTransaction((client) => deleteTestData(prefix, client))
  await closePool()
})

describe('protected operations', () => {
  const someId = randomUUID()
  const operations: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: object }[] = [
    { method: 'GET', path: '/api/admin/summary' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/bid-requests?status=all' },
    { method: 'GET', path: `/api/admin/bid-requests/${someId}` },
    { method: 'POST', path: `/api/admin/bid-requests/${someId}/status-changes`, body: { from: 'pending', to: 'accepted' } },
  ]

  function send(client: BrowserClient, { method, path, body }: (typeof operations)[number]): Promise<ApiResponse> {
    if (method === 'GET') {
      return client.get(path)
    }
    if (method === 'DELETE') {
      return client.delete(path)
    }
    return method === 'POST' ? client.post(path, body) : client.patch(path, body)
  }

  test('visitors must sign in for every one', async () => {
    for (const operation of operations) {
      assert.equal((await send(visitor, operation)).status, 401, `${operation.method} ${operation.path}`)
    }
  })

  test('customers are refused every one, even with a valid session and CSRF token', async () => {
    for (const operation of operations) {
      const response = await send(customer, operation)
      assert.equal(response.status, 403, `${operation.method} ${operation.path}: ${JSON.stringify(response.body)}`)
    }
  })
})

describe('sales and lots', () => {
  test('come from the auction monitor, so nobody can create, change or delete them through the API', async () => {
    const id = saleId('one')
    for (const [method, path] of [
      ['POST', '/api/auctions'],
      ['PATCH', `/api/auctions/${id}`],
      ['DELETE', `/api/auctions/${id}`],
      ['POST', '/api/lots'],
      ['POST', '/api/catalogues'],
    ] as const) {
      const response = method === 'POST' ? await admin.post(path, {}) : method === 'PATCH' ? await admin.patch(path, {}) : await admin.delete(path)
      assert.equal(response.status, 404, `${method} ${path}`)
    }
    const { rows } = await pool.query<{ lots: number }>('SELECT count(*)::int AS lots FROM lots WHERE auction_id = $1', [id])
    assert.equal(rows[0]?.lots, 20, 'nothing changed')
  })
})

describe('dashboard summary', () => {
  test('counts upcoming and completed sales, the lots of upcoming sales and open requests', async () => {
    const before = await summary()
    await createSale('upcoming', 30, 4)
    await createSale('past', -30, 2)
    const pending = await submit(customer, 'upcoming', 1)
    const accepted = await submit(customer, 'upcoming', 2)
    const change = await admin.post(`/api/admin/bid-requests/${accepted}/status-changes`, { from: 'pending', to: 'accepted' })
    assert.equal(change.status, 201)

    const after = await summary()
    assert.deepEqual(
      {
        upcomingAuctions: after.upcomingAuctions - before.upcomingAuctions,
        completedAuctions: after.completedAuctions - before.completedAuctions,
        upcomingLots: after.upcomingLots - before.upcomingLots,
        pendingRequests: after.pendingRequests - before.pendingRequests,
        acceptedRequests: after.acceptedRequests - before.acceptedRequests,
        placedBids: after.placedBids - before.placedBids,
      },
      // Only the upcoming sale's lots count, as the card's list (upcoming lots) shows.
      { upcomingAuctions: 1, completedAuctions: 1, upcomingLots: 4, pendingRequests: 1, acceptedRequests: 1, placedBids: 0 },
    )
    assert.ok(pending)
  })
})

describe('bid request filters', () => {
  let other: BrowserClient
  const ids = { oneByElodie: '', twoByElodie: '', oneByOther: '' }

  before(async () => {
    other = await register('other', 'customer', { firstName: 'Paul', lastName: '100% Smith' })
    ids.oneByElodie = await submit(customer, 'one', 10)
    ids.twoByElodie = await submit(customer, 'two', 10)
    ids.oneByOther = await submit(other, 'one', 11)
    await admin.post(`/api/admin/bid-requests/${ids.twoByElodie}/status-changes`, { from: 'pending', to: 'rejected' })
  })

  function idsIn(response: ApiResponse): string[] {
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return requestList.parse(response.body).requests.map((request) => request.id)
  }

  test('by sale', async () => {
    const found = idsIn(await listRequests(`status=all&auction=${saleId('one')}`))
    assert.deepEqual(new Set(found), new Set([ids.oneByElodie, ids.oneByOther]))
  })

  test('by customer name, email or company, ignoring case and accents typed as shown', async () => {
    const byName = await listRequests(`status=all&customer=${encodeURIComponent('élodie mar')}`)
    const found = requestList.parse(byName.body).requests
    assert.ok(found.length >= 2)
    assert.ok(found.every((request) => request.customer.email === `${prefix}-customer@example.com`), 'only her requests')
    assert.ok([ids.oneByElodie, ids.twoByElodie].every((id) => found.some((request) => request.id === id)))
    assert.deepEqual(idsIn(await listRequests(`status=all&customer=${encodeURIComponent(`${prefix}-OTHER`)}`)), [ids.oneByOther])
  })

  test('search text is matched literally, wildcards included', async () => {
    assert.deepEqual(idsIn(await listRequests(`status=all&auction=${saleId('one')}&customer=${encodeURIComponent('100%')}`)), [ids.oneByOther])
    assert.deepEqual(idsIn(await listRequests(`status=all&auction=${saleId('one')}&customer=${encodeURIComponent('_')}`)), [])
  })

  test('by status, including all of them, combined with the other filters', async () => {
    const all = await listRequests(`status=all&customer=${encodeURIComponent(`${prefix}-customer`)}`)
    assert.ok(idsIn(all).includes(ids.twoByElodie), 'rejected requests are included')
    assert.deepEqual(idsIn(await listRequests(`status=rejected&customer=${encodeURIComponent('Élodie')}&auction=${saleId('two')}`)), [ids.twoByElodie])
    assert.deepEqual(idsIn(await listRequests(`status=pending&auction=${saleId('two')}`)), [])
    assert.equal(requestList.parse((await listRequests(`status=all&auction=${saleId('one')}`)).body).total, 2)
  })

  test('filter values are checked', async () => {
    assert.equal((await listRequests('status=everything')).status, 400)
    assert.equal((await listRequests('auction=Not A Sale')).status, 400)
    assert.equal((await listRequests(`customer=${'x'.repeat(201)}`)).status, 400)
  })
})
