// Bid requests and the public Requested lots list, against the real app and local database.
// Everything here uses bidtest-<run>-… slugs and emails and is removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { closePool, pool, withTransaction } from '../src/db/pool.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const run = randomUUID().slice(0, 8)
const prefix = `bidtest-${run}`
const slugs = {
  open: `${prefix}-open`,
  openCatalogue: `${prefix}-open-cat`,
  other: `${prefix}-other`,
  otherCatalogue: `${prefix}-other-cat`,
  closed: `${prefix}-closed`,
  closedCatalogue: `${prefix}-closed-cat`,
}

const requestBody = z.object({
  request: z.object({
    id: z.uuid(),
    lotNumber: z.number(),
    maxBidEur: z.string(),
    instructions: z.string(),
    status: z.string(),
    auction: z.object({ id: z.string(), saleDate: z.iso.date(), saleTime: z.string() }).loose(),
    catalogue: z.object({ id: z.string(), title: z.string() }),
  }),
})
const listBody = z.object({ requests: z.array(requestBody.shape.request) })
const lotsBody = z.object({
  lots: z.array(
    z.strictObject({
      auction: z.strictObject({ id: z.string(), title: z.string(), house: z.string(), saleDate: z.string() }),
      catalogue: z.strictObject({ id: z.string(), title: z.string() }),
      lotNumber: z.number(),
      availability: z.enum(['reserved', 'sale-ended']),
    }),
  ),
})
const errorBody = z.object({ error: z.object({ code: z.string(), details: z.array(z.object({ path: z.string() })).optional() }) })

function errorCode(response: ApiResponse): string {
  return errorBody.parse(response.body).error.code
}

let server: TestServer
let verified: BrowserClient
let verifiedUserId: string
let otherCustomerId: string

async function createSale(slug: string, catalogueSlug: string, startsIn: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, description)
     VALUES ($1, 'Test sale', 'Fine art', 'Maison Test', 'Paris', now() + $2::interval, 'A test sale.') RETURNING id`,
    [slug, startsIn],
  )
  await pool.query(
    `INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, pdf_url)
     VALUES ($1, $2, 'Test catalogue', '', 1, 100, 'https://example.com/test.pdf')`,
    [catalogueSlug, rows[0]?.id],
  )
}

/** Registers through the API; optionally marks the email as confirmed. */
async function newCustomer(label: string, { confirmed }: { confirmed: boolean }): Promise<{ client: BrowserClient; id: string }> {
  const client = new BrowserClient(server.baseUrl)
  const email = `${prefix}-${label}@example.com`
  const response = await client.post('/api/auth/register', {
    firstName: 'Test',
    lastName: label,
    email,
    password: 'correct horse battery staple',
    countryCode: 'FR',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  const id = z.object({ user: z.object({ id: z.string() }).loose() }).parse(response.body).user.id
  if (confirmed) {
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [id])
  }
  return { client, id }
}

function bid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { auctionId: slugs.open, catalogueId: slugs.openCatalogue, lotNumber: 10, maxBidEur: 2500, instructions: '', ...overrides }
}

before(async () => {
  server = await startTestServer(createApp())
  await createSale(slugs.open, slugs.openCatalogue, '30 days')
  await createSale(slugs.other, slugs.otherCatalogue, '40 days')
  await createSale(slugs.closed, slugs.closedCatalogue, '-10 days')

  const customer = await newCustomer('verified', { confirmed: true })
  verified = customer.client
  verifiedUserId = customer.id

  // Another customer's accepted request reserves lot 45 of the open sale.
  const other = await newCustomer('other', { confirmed: true })
  otherCustomerId = other.id
  await pool.query(
    `INSERT INTO bid_requests (customer_id, auction_id, catalogue_id, lot_number, max_bid_eur, status)
     SELECT $1, c.auction_id, c.id, 45, 98765, 'accepted' FROM catalogues c WHERE c.slug = $2`,
    [otherCustomerId, slugs.openCatalogue],
  )
})

after(async () => {
  await server.close()
  // The audit trail refuses deletes; lift that for these test rows only, inside one transaction.
  await withTransaction(async (client) => {
    await client.query('ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only')
    await client.query(
      `DELETE FROM request_status_history WHERE bid_request_id IN (
         SELECT br.id FROM bid_requests br JOIN auctions a ON a.id = br.auction_id WHERE a.slug LIKE $1)`,
      [`${prefix}-%`],
    )
    await client.query('ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only')
    await client.query(
      'DELETE FROM bid_requests WHERE auction_id IN (SELECT id FROM auctions WHERE slug LIKE $1)',
      [`${prefix}-%`],
    )
    await client.query('DELETE FROM catalogues WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM auctions WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM users WHERE email LIKE $1', [`${prefix}-%`])
  })
  await closePool()
})

describe('who can request a bid', () => {
  test('visitors must sign in', async () => {
    const visitor = new BrowserClient(server.baseUrl)
    assert.equal((await visitor.get('/api/bid-requests')).status, 401)
    const response = await visitor.post('/api/bid-requests', bid())
    assert.equal(response.status, 401)
    assert.equal(errorCode(response), 'unauthenticated')
  })

  test('customers must confirm their email address first', async () => {
    const { client } = await newCustomer('unconfirmed', { confirmed: false })
    const response = await client.post('/api/bid-requests', bid())
    assert.equal(response.status, 403)
    assert.equal(errorCode(response), 'email_not_verified')
    // They can still see their (empty) list
    assert.deepEqual(listBody.parse((await client.get('/api/bid-requests')).body).requests, [])
  })

  test('administrators do not request bids', async () => {
    const { client, id } = await newCustomer('admin', { confirmed: true })
    await pool.query("UPDATE users SET role = 'administrator' WHERE id = $1", [id])
    const response = await client.post('/api/bid-requests', bid())
    assert.equal(response.status, 403)
    assert.equal(errorCode(response), 'forbidden')
  })
})

describe('submitting', () => {
  test('a confirmed customer creates a pending request, recorded in the audit trail', async () => {
    const response = await verified.post('/api/bid-requests', bid({ instructions: '  Only if unrestored.  ' }))
    assert.equal(response.status, 201, JSON.stringify(response.body))
    const { request } = requestBody.parse(response.body)

    assert.equal(request.status, 'pending')
    assert.equal(request.maxBidEur, '2500.00')
    assert.equal(request.instructions, 'Only if unrestored.')
    assert.equal(request.auction.id, slugs.open)
    assert.equal(request.catalogue.id, slugs.openCatalogue)

    const { rows } = await pool.query<{ customerId: string; fromStatus: string | null; toStatus: string; changedBy: string }>(
      `SELECT br.customer_id AS "customerId", h.from_status AS "fromStatus", h.to_status AS "toStatus", h.changed_by AS "changedBy"
       FROM bid_requests br JOIN request_status_history h ON h.bid_request_id = br.id WHERE br.id = $1`,
      [request.id],
    )
    assert.deepEqual(rows, [{ customerId: verifiedUserId, fromStatus: null, toStatus: 'pending', changedBy: verifiedUserId }])
  })

  test('the same customer cannot request the same lot twice', async () => {
    await verified.post('/api/bid-requests', bid({ lotNumber: 20 }))
    const again = await verified.post('/api/bid-requests', bid({ lotNumber: 20, maxBidEur: 3000 }))
    assert.equal(again.status, 409)
    assert.equal(errorCode(again), 'already_requested')
  })

  test("a lot reserved by another customer's accepted request is refused", async () => {
    const response = await verified.post('/api/bid-requests', bid({ lotNumber: 45 }))
    assert.equal(response.status, 409)
    assert.equal(errorCode(response), 'lot_reserved')
  })

  test("another customer's pending request does not reserve the lot", async () => {
    const { client } = await newCustomer('second', { confirmed: true })
    await client.post('/api/bid-requests', bid({ lotNumber: 30 }))
    const response = await verified.post('/api/bid-requests', bid({ lotNumber: 30 }))
    assert.equal(response.status, 201)
  })

  test('the sale, catalogue and lot must match and be open', async () => {
    const outOfRange = await verified.post('/api/bid-requests', bid({ lotNumber: 101 }))
    assert.equal(errorCode(outOfRange), 'lot_out_of_range')

    const mismatch = await verified.post('/api/bid-requests', bid({ catalogueId: slugs.otherCatalogue }))
    assert.equal(errorCode(mismatch), 'catalogue_mismatch')

    const closed = await verified.post('/api/bid-requests', bid({ auctionId: slugs.closed, catalogueId: slugs.closedCatalogue }))
    assert.equal(closed.status, 409)
    assert.equal(errorCode(closed), 'sale_closed')

    const unknown = await verified.post('/api/bid-requests', bid({ auctionId: `${prefix}-missing` }))
    assert.equal(errorCode(unknown), 'sale_closed')
  })

  test('amounts are whole euros within the limits', async () => {
    const response = await verified.post('/api/bid-requests', bid({ maxBidEur: 10, lotNumber: 1.5 }))
    assert.equal(response.status, 400)
    assert.deepEqual(
      errorBody.parse(response.body).error.details?.map((detail) => detail.path).sort(),
      ['body.lotNumber', 'body.maxBidEur'],
    )
    const cents = await verified.post('/api/bid-requests', bid({ maxBidEur: 2500.5 }))
    assert.equal(cents.status, 400)
  })
})

describe('My requests', () => {
  test("lists only the signed-in customer's own requests", async () => {
    const { requests } = listBody.parse((await verified.get('/api/bid-requests')).body)
    assert.ok(requests.length >= 3)
    assert.ok(requests.every((request) => request.lotNumber !== 45), "the other customer's request is not listed")

    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM bid_requests WHERE customer_id = $1',
      [verifiedUserId],
    )
    assert.equal(requests.length, rows[0]?.count)
  })
})

describe('Requested lots', () => {
  test('anyone can see reserved lots, without customers or amounts', async () => {
    const response = await new BrowserClient(server.baseUrl).get('/api/requested-lots')
    assert.equal(response.status, 200)
    // strictObject: any extra field (customer, amount, request id) fails the parse
    const { lots } = lotsBody.parse(response.body)
    const ours = lots.filter((lot) => lot.catalogue.id === slugs.openCatalogue)
    assert.deepEqual(
      ours.map((lot) => [lot.lotNumber, lot.availability]),
      [[45, 'reserved']],
      'only the accepted request is listed, not pending ones',
    )
    const text = JSON.stringify(response.body)
    assert.ok(!text.includes('98765'))
    assert.ok(!text.includes(otherCustomerId))
  })
})
