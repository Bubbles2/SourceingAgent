// Database constraints from the migrations. Everything runs in one transaction that is rolled
// back at the end, so the database is left as it was. Requires `npm run migrate:up` first.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type pg from 'pg'
import { insertTestSale, testSourceId } from '../src/cli/testSales.ts'
import { closePool, pool } from '../src/db/pool.ts'

let client: pg.PoolClient
const ids = {
  alice: '',
  bob: '',
  auction: '',
  otherAuction: '',
  lot: '',
  otherLot: '',
  aliceRequest: '',
}

async function insertId(text: string, values: unknown[]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(`${text} RETURNING id`, values)
  const id = rows[0]?.id
  assert.ok(id, 'insert returned no id')
  return id
}

/** Runs a statement that must fail, then rolls back just that statement. */
async function expectViolation(text: string, values: unknown[], expected: { code: string; constraint?: string }): Promise<void> {
  await client.query('SAVEPOINT expected_failure')
  try {
    await client.query(text, values)
    assert.fail(`Expected ${expected.constraint ?? expected.code} to reject: ${text}`)
  } catch (error) {
    assert.equal(Reflect.get(Object(error), 'code'), expected.code)
    if (expected.constraint) {
      assert.equal(Reflect.get(Object(error), 'constraint'), expected.constraint)
    }
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_failure')
  }
}

const insertUser =
  'INSERT INTO users (email, password_hash, first_name, last_name, country_code) VALUES ($1, $2, $3, $4, $5)'
const insertRequest =
  'INSERT INTO bid_requests (customer_id, auction_id, lot_id, max_bid_eur, status) VALUES ($1, $2, $3, $4, $5)'

before(async () => {
  client = await pool.connect()
  await client.query('BEGIN')
  ids.alice = await insertId(insertUser, ['alice@example.com', 'test-hash', 'Alice', 'Martin', 'FR'])
  ids.bob = await insertId(insertUser, ['bob@example.com', 'test-hash', 'Bob', 'Smith', 'GB'])
  const sale = await insertTestSale('schematest-sale', { daysAhead: 7, lotCount: 2 }, client)
  const otherSale = await insertTestSale('schematest-other-sale', { daysAhead: 7, lotCount: 1 }, client)
  ids.auction = sale.auctionId
  ids.otherAuction = otherSale.auctionId
  ids.lot = sale.lots[0]?.id ?? ''
  ids.otherLot = otherSale.lots[0]?.id ?? ''
  ids.aliceRequest = await insertId(insertRequest, [ids.alice, ids.auction, ids.lot, '12500.50', 'accepted'])
})

after(async () => {
  await client.query('ROLLBACK')
  client.release()
  await closePool()
})

test('request ids are generated UUIDs; sale and lot ids are numbers, as in the auction monitor', () => {
  assert.match(ids.aliceRequest, /^[0-9a-f-]{36}$/)
  assert.match(ids.auction, /^\d+$/)
  assert.match(ids.lot, /^\d+$/)
})

test('maximum bids are stored exactly as NUMERIC and returned as strings', async () => {
  const { rows } = await client.query<{ max_bid_eur: string }>('SELECT max_bid_eur FROM bid_requests WHERE id = $1', [
    ids.aliceRequest,
  ])
  assert.equal(rows[0]?.max_bid_eur, '12500.50')
})

test('an accepted request reserves the lot against other customers', async () => {
  await expectViolation(insertRequest, [ids.bob, ids.auction, ids.lot, '15000', 'accepted'], {
    code: '23505',
    constraint: 'bid_requests_one_reserving_request_per_lot',
  })
})

test('pending requests from other customers are still allowed on a reserved lot', async () => {
  await client.query('SAVEPOINT pending_request')
  await client.query(insertRequest, [ids.bob, ids.auction, ids.lot, '15000', 'pending'])
  await client.query('ROLLBACK TO SAVEPOINT pending_request')
})

test('a customer cannot open a second request for the same lot', async () => {
  await expectViolation(insertRequest, [ids.alice, ids.auction, ids.lot, '13000', 'pending'], {
    code: '23505',
    constraint: 'bid_requests_one_open_request_per_customer_lot',
  })
})

test("the lot must belong to the request's auction", async () => {
  await expectViolation(insertRequest, [ids.bob, ids.otherAuction, ids.lot, '500', 'pending'], {
    code: '23503',
    constraint: 'bid_requests_lot_auction_fkey',
  })
})

test('maximum bids must be positive and statuses must be known', async () => {
  await expectViolation(insertRequest, [ids.bob, ids.otherAuction, ids.otherLot, '0', 'pending'], {
    code: '23514',
    constraint: 'bid_requests_max_bid_positive',
  })
  await expectViolation(insertRequest, [ids.bob, ids.otherAuction, ids.otherLot, '500', 'approved'], {
    code: '23514',
    constraint: 'bid_request_status_check',
  })
})

test('emails are unique and stored lower-case', async () => {
  await expectViolation(insertUser, ['alice@example.com', 'test-hash', 'Another', 'Alice', 'FR'], {
    code: '23505',
    constraint: 'users_email_key',
  })
  await expectViolation(insertUser, ['Carol@Example.com', 'test-hash', 'Carol', 'Jones', 'US'], {
    code: '23514',
    constraint: 'users_email_format',
  })
})

test('status history is append-only', async () => {
  const historyId = await insertId(
    "INSERT INTO request_status_history (bid_request_id, from_status, to_status, changed_by) VALUES ($1, 'pending', 'accepted', $2)",
    [ids.aliceRequest, ids.bob],
  )
  await expectViolation("UPDATE request_status_history SET note = 'edited' WHERE id = $1", [historyId], { code: '23001' })
  await expectViolation('DELETE FROM request_status_history WHERE id = $1', [historyId], { code: '23001' })
})

test("a sale is stored once per source, and a lot once per sale, by the source website's ids", async () => {
  await expectViolation(
    "INSERT INTO auctions (source_id, external_id, title, source_url) VALUES ($1, 'schematest-sale', 'Again', 'https://example.com/again')",
    [testSourceId],
    { code: '23505', constraint: 'auctions_source_id_external_id_key' },
  )
  await expectViolation(
    "INSERT INTO lots (auction_id, external_id, source_url) VALUES ($1, 'schematest-sale-1', 'https://example.com/again')",
    [ids.auction],
    { code: '23505', constraint: 'lots_auction_id_external_id_key' },
  )
})

test('a sale, and a collection run, must name a known source', async () => {
  await expectViolation(
    "INSERT INTO auctions (source_id, external_id, title, source_url) VALUES (999999999, 'schematest-unknown', 'Unknown', 'https://example.com/unknown')",
    [],
    { code: '23503', constraint: 'auctions_source_id_fkey' },
  )
  await expectViolation('INSERT INTO collection_runs (source_id) VALUES (999999999)', [], {
    code: '23503',
    constraint: 'collection_runs_source_id_fkey',
  })
})

test('the 30-day purge deletes old sales and their lots, but keeps those with bid requests', async () => {
  await client.query('SAVEPOINT purge')
  const oldSale = await insertTestSale('schematest-old-sale', { daysAhead: -40, lotCount: 2 }, client)
  const requestedSale = await insertTestSale('schematest-old-requested-sale', { daysAhead: -40, lotCount: 2 }, client)
  // Even a rejected request keeps its sale
  await client.query(insertRequest, [ids.bob, requestedSale.auctionId, requestedSale.lots[0]?.id, '300', 'rejected'])

  const { rows } = await client.query<{ auctions_deleted: number; lots_deleted: number }>(
    'SELECT auctions_deleted, lots_deleted FROM purge_old_auctions_30d()',
  )
  assert.ok((rows[0]?.auctions_deleted ?? 0) >= 1 && (rows[0]?.lots_deleted ?? 0) >= 2)
  const left = await client.query<{ id: string; lots: number }>(
    'SELECT a.id, (SELECT count(*)::int FROM lots l WHERE l.auction_id = a.id) AS lots FROM auctions a WHERE a.id = ANY($1) ORDER BY a.id',
    [[oldSale.auctionId, requestedSale.auctionId, ids.auction]],
  )
  assert.deepEqual(left.rows, [
    { id: ids.auction, lots: 2 },
    { id: requestedSale.auctionId, lots: 2 },
  ])
  await client.query('ROLLBACK TO SAVEPOINT purge')
})

test('a requested lot, and a sale with lots, cannot be deleted', async () => {
  await expectViolation('DELETE FROM lots WHERE id = $1', [ids.lot], {
    code: '23503',
    constraint: 'bid_requests_lot_auction_fkey',
  })
  await expectViolation('DELETE FROM auctions WHERE id = $1', [ids.otherAuction], {
    code: '23503',
    constraint: 'lots_auction_id_fkey',
  })
})

test("each lot's search documents are generated from its original and English text", async () => {
  const { rows } = await client.query<{ original: boolean; english: boolean }>(
    `SELECT search_document @@ to_tsquery('simple', 'objet') AS original,
            search_document_ai @@ to_tsquery('simple', 'object') AS english
     FROM lots WHERE id = $1`,
    [ids.lot],
  )
  assert.deepEqual(rows[0], { original: true, english: true })
})
