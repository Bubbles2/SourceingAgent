// Database constraints from the migrations, and the views over the Drouot collector's sales. Everything
// runs in one transaction that is rolled back at the end, so the database is left as it was.
// Requires `npm run migrate:up` first.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type pg from 'pg'
import { insertTestSale } from '../src/cli/testSales.ts'
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

test('request ids are generated UUIDs; sale and lot ids are numbers, as in the collector', () => {
  assert.match(ids.aliceRequest, /^[0-9a-f-]{36}$/)
  assert.match(ids.auction, /^\d+$/)
  assert.match(ids.lot, /^\d+$/)
  // Test sales are numbered far above the collector's
  assert.ok(BigInt(ids.auction) >= 900000000001n && BigInt(ids.lot) >= 900000000001n)
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

test('a request names its lot without a foreign key; the API checks the lot belongs to the sale', async () => {
  const { rows } = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid = 'bid_requests'::regclass AND contype = 'f'",
  )
  // Only the customer foreign key is left: lots are a view over the collector's data.
  assert.equal(rows[0]?.count, 1)
  const constraint = await client.query(
    "SELECT 1 FROM pg_constraint WHERE conrelid = 'bid_requests'::regclass AND conname = 'bid_requests_lot_auction_fkey'",
  )
  assert.equal(constraint.rowCount, 0)
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

test('auctions and lots are read-only views of the collector, with the test sales added', async () => {
  const { rows } = await client.query<{ name: string; kind: string }>(
    `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c
     WHERE c.relnamespace = current_schema()::regnamespace
       AND c.relname IN ('auctions', 'lots', 'test_auctions', 'test_lots', 'auction_sources', 'collection_runs')
     ORDER BY c.relname`,
  )
  assert.deepEqual(rows, [
    { name: 'auctions', kind: 'v' },
    { name: 'lots', kind: 'v' },
    { name: 'test_auctions', kind: 'r' },
    { name: 'test_lots', kind: 'r' },
  ])
  const purge = await client.query("SELECT 1 FROM pg_proc WHERE proname = 'purge_old_auctions_30d' AND pronamespace = current_schema()::regnamespace")
  assert.equal(purge.rowCount, 0, "the monitor's purge is gone: the collector owns its data")

  // The views can't be written, so nothing the app does can change the collector's data.
  await expectViolation('DELETE FROM lots WHERE id = $1', [ids.lot], { code: '55000' })
  await expectViolation("UPDATE auctions SET title = 'Changed' WHERE id = $1", [ids.auction], { code: '55000' })
})

test("every collector sale and lot is in the views, with the lot's sale given by its id", async () => {
  const { rows } = await client.query<{ collectorSales: number; viewSales: number; collectorLots: number; matchedLots: number }>(
    `SELECT
       (SELECT count(*)::int FROM drouot_collector.auctions) AS "collectorSales",
       (SELECT count(*)::int FROM auctions v JOIN drouot_collector.auctions a ON a.id = v.id AND a.auction_id = v.external_id) AS "viewSales",
       (SELECT count(*)::int FROM drouot_collector.lots) AS "collectorLots",
       (SELECT count(*)::int FROM lots v
          JOIN drouot_collector.lots l ON l.id = v.id AND l.lot_id = v.external_id
          JOIN drouot_collector.auctions a ON a.source = l.source AND a.auction_id = l.auction_id AND a.id = v.auction_id) AS "matchedLots"`,
  )
  const counts = rows[0]
  assert.ok(counts)
  assert.equal(counts.viewSales, counts.collectorSales)
  assert.equal(counts.matchedLots, counts.collectorLots)

  // Every sale has a title, even those the collector couldn't read
  const untitled = await client.query('SELECT 1 FROM auctions WHERE title IS NULL')
  assert.equal(untitled.rowCount, 0)
})

test('the views keep the types the API returns: bigint ids, exact estimates, three-letter currencies', async () => {
  await client.query('SAVEPOINT estimates')
  await client.query(
    "UPDATE test_lots SET estimate_low = 1500, estimate_high = 2000.5, materials = '{bronze}' WHERE id = $1",
    [ids.lot],
  )
  const { rows } = await client.query<Record<string, unknown>>(
    'SELECT id, auction_id, estimate_low, estimate_high, currency, materials FROM lots WHERE id = $1',
    [ids.lot],
  )
  assert.deepEqual(rows[0], {
    id: ids.lot,
    auction_id: ids.auction,
    estimate_low: '1500.00',
    estimate_high: '2000.50',
    currency: 'EUR',
    materials: ['bronze'],
  })
  await client.query('ROLLBACK TO SAVEPOINT estimates')
  const types = await client.query<{ column: string; type: string }>(
    `SELECT attname AS column, format_type(atttypid, atttypmod) AS type FROM pg_attribute
     WHERE attrelid = 'lots'::regclass AND attname IN ('id', 'auction_id', 'estimate_low', 'currency') ORDER BY attnum`,
  )
  assert.deepEqual(types.rows, [
    { column: 'id', type: 'bigint' },
    { column: 'auction_id', type: 'bigint' },
    { column: 'estimate_low', type: 'numeric(14,2)' },
    { column: 'currency', type: 'character(3)' },
  ])
})

test('a test sale is stored once, and a test lot once per sale, by their external ids', async () => {
  await expectViolation(
    "INSERT INTO test_auctions (external_id, title, source_url) VALUES ('schematest-sale', 'Again', 'https://example.com/again')",
    [],
    { code: '23505', constraint: 'test_auctions_external_id_key' },
  )
  await expectViolation(
    "INSERT INTO test_lots (auction_id, external_id, source_url) VALUES ($1, 'schematest-sale-1', 'https://example.com/again')",
    [ids.auction],
    { code: '23505', constraint: 'test_lots_auction_id_external_id_key' },
  )
})

test("a test lot must name a test sale, and test ids can't take the collector's", async () => {
  await expectViolation(
    "INSERT INTO test_lots (auction_id, external_id, source_url) VALUES (5, 'schematest-unknown', 'https://example.com/unknown')",
    [],
    { code: '23503', constraint: 'test_lots_auction_id_fkey' },
  )
  await expectViolation(
    "INSERT INTO test_auctions (id, external_id, title, source_url) VALUES (5, 'schematest-low-id', 'Low', 'https://example.com/low')",
    [],
    { code: '23514', constraint: 'test_auctions_id_range' },
  )
  await expectViolation('DELETE FROM test_auctions WHERE id = $1', [ids.otherAuction], {
    code: '23503',
    constraint: 'test_lots_auction_id_fkey',
  })
})
