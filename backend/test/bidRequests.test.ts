// Bid requests and the public Requested lots list, against the real app and local database.
// Everything here uses bidtest-<run>-… sale ids and emails and is removed afterwards.
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
const prefix = `bidtest-${run}`

const saleBody = z.strictObject({
  id: z.string(),
  title: z.string(),
  startsAt: z.iso.datetime().nullable(),
  auctionDate: z.iso.date().nullable(),
  location: z.string().nullable(),
})
const lotBody = z.strictObject({ id: z.string(), lotNumber: z.string().nullable(), title: z.string().nullable(), titleUk: z.string().nullable() })
const requestBody = z.object({
  request: z.strictObject({
    id: z.uuid(),
    maxBidEur: z.string(),
    instructions: z.string(),
    status: z.string(),
    submittedAt: z.iso.datetime(),
    auction: saleBody,
    lot: lotBody,
  }),
})
const listBody = z.object({ requests: z.array(requestBody.shape.request) })
const lotsBody = z.object({
  // strictObject: any extra field (customer, amount, request id) fails the parse
  lots: z.array(z.strictObject({ auction: saleBody, lot: lotBody, availability: z.enum(['reserved', 'sale-ended']) })),
})
const errorBody = z.object({ error: z.object({ code: z.string(), details: z.array(z.object({ path: z.string() })).optional() }) })

function errorCode(response: ApiResponse): string {
  return errorBody.parse(response.body).error.code
}

let server: TestServer
let verified: BrowserClient
let verifiedUserId: string
let otherCustomerId: string
const sales: Record<'open' | 'other' | 'closed' | 'undated', TestSale> = {
  open: { auctionId: '', lots: [] },
  other: { auctionId: '', lots: [] },
  closed: { auctionId: '', lots: [] },
  undated: { auctionId: '', lots: [] },
}

/** The id of a lot, by its number in the sale */
function lot(sale: TestSale, lotNumber: number): string {
  const found = sale.lots.find((candidate) => candidate.lotNumber === String(lotNumber))
  assert.ok(found, `no lot ${lotNumber}`)
  return found.id
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
  return {
    auctionId: sales.open.auctionId,
    lotId: lot(sales.open, 10),
    maxBidEur: 2500,
    instructions: '',
    acknowledgedCharges: true,
    ...overrides,
  }
}

async function insertAcceptedRequest(customerId: string, sale: TestSale, lotNumber: number): Promise<void> {
  await pool.query(
    "INSERT INTO bid_requests (customer_id, auction_id, lot_id, max_bid_eur, status) VALUES ($1, $2, $3, 98765, 'accepted')",
    [customerId, sale.auctionId, lot(sale, lotNumber)],
  )
}

before(async () => {
  server = await startTestServer(createApp())
  sales.open = await insertTestSale(`${prefix}-open`, { daysAhead: 30, lotCount: 50 }, pool)
  sales.other = await insertTestSale(`${prefix}-other`, { daysAhead: 40 }, pool)
  sales.closed = await insertTestSale(`${prefix}-closed`, { daysAhead: -10 }, pool)
  sales.undated = await insertTestSale(`${prefix}-undated`, { daysAhead: 30 }, pool)
  await pool.query('UPDATE auctions SET starts_at = NULL, auction_date = NULL WHERE id = $1', [sales.undated.auctionId])

  const customer = await newCustomer('verified', { confirmed: true })
  verified = customer.client
  verifiedUserId = customer.id

  // Another customer's accepted requests reserve lot 45 of the open sale, and lot 2 of the closed one.
  const other = await newCustomer('other', { confirmed: true })
  otherCustomerId = other.id
  await insertAcceptedRequest(otherCustomerId, sales.open, 45)
  await insertAcceptedRequest(otherCustomerId, sales.closed, 2)
})

after(async () => {
  await server.close()
  await withTransaction((client) => deleteTestData(prefix, client))
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
    assert.equal(request.auction.id, sales.open.auctionId)
    assert.equal(request.auction.title, `Test sale ${prefix}-open`)
    assert.deepEqual(request.lot, { id: lot(sales.open, 10), lotNumber: '10', title: '10 - Objet 10', titleUk: 'Test object 10' })

    const { rows } = await pool.query<{ customerId: string; fromStatus: string | null; toStatus: string; changedBy: string }>(
      `SELECT br.customer_id AS "customerId", h.from_status AS "fromStatus", h.to_status AS "toStatus", h.changed_by AS "changedBy"
       FROM bid_requests br JOIN request_status_history h ON h.bid_request_id = br.id WHERE br.id = $1`,
      [request.id],
    )
    assert.deepEqual(rows, [{ customerId: verifiedUserId, fromStatus: null, toStatus: 'pending', changedBy: verifiedUserId }])
  })

  test('the same customer cannot request the same lot twice', async () => {
    await verified.post('/api/bid-requests', bid({ lotId: lot(sales.open, 20) }))
    const again = await verified.post('/api/bid-requests', bid({ lotId: lot(sales.open, 20), maxBidEur: 3000 }))
    assert.equal(again.status, 409)
    assert.equal(errorCode(again), 'already_requested')
  })

  test("a lot reserved by another customer's accepted request is refused", async () => {
    const response = await verified.post('/api/bid-requests', bid({ lotId: lot(sales.open, 45) }))
    assert.equal(response.status, 409)
    assert.equal(errorCode(response), 'lot_reserved')
  })

  test("another customer's pending request does not reserve the lot", async () => {
    const { client } = await newCustomer('second', { confirmed: true })
    await client.post('/api/bid-requests', bid({ lotId: lot(sales.open, 30) }))
    const response = await verified.post('/api/bid-requests', bid({ lotId: lot(sales.open, 30) }))
    assert.equal(response.status, 201)
  })

  test('the lot must belong to the sale, and the sale must be open', async () => {
    const mismatch = await verified.post('/api/bid-requests', bid({ lotId: lot(sales.other, 1) }))
    assert.equal(mismatch.status, 400)
    assert.equal(errorCode(mismatch), 'lot_mismatch')

    const unknownLot = await verified.post('/api/bid-requests', bid({ lotId: '999999999999' }))
    assert.equal(errorCode(unknownLot), 'lot_mismatch')

    const closed = await verified.post('/api/bid-requests', bid({ auctionId: sales.closed.auctionId, lotId: lot(sales.closed, 1) }))
    assert.equal(closed.status, 409)
    assert.equal(errorCode(closed), 'sale_closed')

    const unknownSale = await verified.post('/api/bid-requests', bid({ auctionId: '999999999999' }))
    assert.equal(errorCode(unknownSale), 'sale_closed')

    // Without a date nobody could say when to bid, so the sale takes no requests.
    const undated = await verified.post('/api/bid-requests', bid({ auctionId: sales.undated.auctionId, lotId: lot(sales.undated, 1) }))
    assert.equal(errorCode(undated), 'sale_closed')
  })

  test('ids are database ids, and amounts are whole euros within the limits', async () => {
    const response = await verified.post('/api/bid-requests', bid({ maxBidEur: 10, lotId: '12abc' }))
    assert.equal(response.status, 400)
    assert.deepEqual(errorBody.parse(response.body).error.details?.map((detail) => detail.path).sort(), [
      'body.lotId',
      'body.maxBidEur',
    ])
    for (const auctionId of [1, '0', '-1', '1234567890123456']) {
      const badSale = await verified.post('/api/bid-requests', bid({ auctionId }))
      assert.equal(badSale.status, 400, String(auctionId))
    }
    const cents = await verified.post('/api/bid-requests', bid({ maxBidEur: 2500.5 }))
    assert.equal(cents.status, 400)
  })

  test('the customer must acknowledge that fees and charges come on top', async () => {
    for (const acknowledgedCharges of [undefined, false, 'yes']) {
      const response = await verified.post('/api/bid-requests', bid({ lotId: lot(sales.open, 31), acknowledgedCharges }))
      assert.equal(response.status, 400, String(acknowledgedCharges))
      assert.deepEqual(
        errorBody.parse(response.body).error.details?.map((detail) => detail.path),
        ['body.acknowledgedCharges'],
      )
    }
  })
})

describe('My requests', () => {
  test("lists only the signed-in customer's own requests", async () => {
    const { requests } = listBody.parse((await verified.get('/api/bid-requests')).body)
    assert.ok(requests.length >= 3)
    assert.ok(requests.every((request) => request.lot.lotNumber !== '45'), "the other customer's request is not listed")

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
    const { lots } = lotsBody.parse(response.body)
    const ours = lots.filter((reserved) => [sales.open.auctionId, sales.closed.auctionId].includes(reserved.auction.id))
    assert.deepEqual(
      ours.map((reserved) => [reserved.auction.id, reserved.lot.lotNumber, reserved.availability]),
      [
        [sales.open.auctionId, '45', 'reserved'],
        [sales.closed.auctionId, '2', 'sale-ended'],
      ],
      'only accepted requests are listed, open sales first',
    )
    const text = JSON.stringify(response.body)
    assert.ok(!text.includes('98765'))
    assert.ok(!text.includes(otherCustomerId))
  })
})
