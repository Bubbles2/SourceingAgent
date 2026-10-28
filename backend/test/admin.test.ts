// The administration area's API: every protected operation refuses visitors and customers, the
// dashboard counts, and the bid request filters. Runs against the real app and local database;
// everything uses admintest-<run>-… ids and emails and is removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { closePool, pool, withTransaction } from '../src/db/pool.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const run = randomUUID().slice(0, 8)
const prefix = `admintest-${run}`

const summaryBody = z.object({
  summary: z.strictObject({
    upcomingAuctions: z.number(),
    draftAuctions: z.number(),
    completedAuctions: z.number(),
    publishedCatalogues: z.number(),
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

async function createSale(id: string, status: 'draft' | 'published', startsIn: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, description, status)
     VALUES ($1, 'Admin test sale', 'Fine art', 'Maison Test', 'Paris', now() + $2::interval, 'A test sale.', $3) RETURNING id`,
    [`${prefix}-${id}`, startsIn, status],
  )
  await pool.query(
    `INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, pdf_url)
     VALUES ($1, $2, 'Admin test catalogue', '', 1, 100, 'https://example.com/test.pdf')`,
    [`${prefix}-${id}-cat`, rows[0]?.id],
  )
}

async function submit(client: BrowserClient, sale: string, lotNumber: number): Promise<string> {
  const response = await client.post('/api/bid-requests', {
    auctionId: `${prefix}-${sale}`,
    catalogueId: `${prefix}-${sale}-cat`,
    lotNumber,
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
  await createSale('one', 'published', '20 days')
  await createSale('two', 'published', '25 days')
})

after(async () => {
  await server.close()
  await withTransaction(async (client) => {
    await client.query('ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only')
    await client.query(
      `DELETE FROM request_status_history WHERE bid_request_id IN (
         SELECT br.id FROM bid_requests br JOIN auctions a ON a.id = br.auction_id WHERE a.slug LIKE $1)`,
      [`${prefix}-%`],
    )
    await client.query('ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only')
    await client.query('DELETE FROM bid_requests WHERE auction_id IN (SELECT id FROM auctions WHERE slug LIKE $1)', [`${prefix}-%`])
    await client.query('DELETE FROM catalogues WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM auctions WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM users WHERE email LIKE $1', [`${prefix}-%`])
  })
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
    { method: 'GET', path: '/api/auctions?status=draft' },
    { method: 'GET', path: '/api/catalogues?status=all' },
    { method: 'POST', path: '/api/auctions', body: { id: `${prefix}-nope` } },
    { method: 'PATCH', path: `/api/auctions/${prefix}-one`, body: { status: 'cancelled' } },
    { method: 'DELETE', path: `/api/auctions/${prefix}-one` },
    { method: 'POST', path: '/api/catalogues', body: { id: `${prefix}-nope` } },
    { method: 'PATCH', path: `/api/catalogues/${prefix}-one-cat`, body: { pdfUrl: 'https://example.com/other.pdf' } },
    { method: 'DELETE', path: `/api/catalogues/${prefix}-one-cat` },
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
    // Nothing changed
    const { rows } = await pool.query<{ status: string }>('SELECT status FROM auctions WHERE slug = $1', [`${prefix}-one`])
    assert.equal(rows[0]?.status, 'published')
    const catalogue = await pool.query('SELECT 1 FROM catalogues WHERE slug = $1', [`${prefix}-one-cat`])
    assert.equal(catalogue.rowCount, 1)
  })
})

describe('dashboard summary', () => {
  test('counts upcoming, draft and completed sales, upcoming published catalogues and open requests', async () => {
    const before = await summary()
    await createSale('draft', 'draft', '30 days')
    await createSale('upcoming', 'published', '30 days')
    await createSale('past', 'published', '-30 days')
    const pending = await submit(customer, 'upcoming', 1)
    const accepted = await submit(customer, 'upcoming', 2)
    const change = await admin.post(`/api/admin/bid-requests/${accepted}/status-changes`, { from: 'pending', to: 'accepted' })
    assert.equal(change.status, 201)

    const after = await summary()
    assert.deepEqual(
      {
        upcomingAuctions: after.upcomingAuctions - before.upcomingAuctions,
        draftAuctions: after.draftAuctions - before.draftAuctions,
        completedAuctions: after.completedAuctions - before.completedAuctions,
        publishedCatalogues: after.publishedCatalogues - before.publishedCatalogues,
        pendingRequests: after.pendingRequests - before.pendingRequests,
        acceptedRequests: after.acceptedRequests - before.acceptedRequests,
        placedBids: after.placedBids - before.placedBids,
      },
      // Only the upcoming published sale's catalogue counts, as the card's list (upcoming catalogues) shows.
      { upcomingAuctions: 1, draftAuctions: 1, completedAuctions: 1, publishedCatalogues: 1, pendingRequests: 1, acceptedRequests: 1, placedBids: 0 },
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
    const found = idsIn(await listRequests(`status=all&auction=${prefix}-one`))
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
    assert.deepEqual(idsIn(await listRequests(`status=all&auction=${prefix}-one&customer=${encodeURIComponent('100%')}`)), [ids.oneByOther])
    assert.deepEqual(idsIn(await listRequests(`status=all&auction=${prefix}-one&customer=${encodeURIComponent('_')}`)), [])
  })

  test('by status, including all of them, combined with the other filters', async () => {
    const all = await listRequests(`status=all&customer=${encodeURIComponent(`${prefix}-customer`)}`)
    assert.ok(idsIn(all).includes(ids.twoByElodie), 'rejected requests are included')
    assert.deepEqual(idsIn(await listRequests(`status=rejected&customer=${encodeURIComponent('Élodie')}&auction=${prefix}-two`)), [ids.twoByElodie])
    assert.deepEqual(idsIn(await listRequests(`status=pending&auction=${prefix}-two`)), [])
    assert.equal(requestList.parse((await listRequests(`status=all&auction=${prefix}-one`)).body).total, 2)
  })

  test('filter values are checked', async () => {
    assert.equal((await listRequests('status=everything')).status, 400)
    assert.equal((await listRequests('auction=Not A Sale')).status, 400)
    assert.equal((await listRequests(`customer=${'x'.repeat(201)}`)).status, 400)
  })
})
