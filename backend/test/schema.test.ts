// Database constraints from the initial migration. Everything runs in one transaction that is rolled
// back at the end, so the database is left as it was. Requires `npm run migrate:up` first.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type pg from 'pg'
import { closePool, pool } from '../src/db/pool.ts'

let client: pg.PoolClient
const ids = {
  alice: '',
  bob: '',
  auction: '',
  otherAuction: '',
  catalogue: '',
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
const insertAuction =
  "INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, description) VALUES ($1, 'Test sale', 'Fine art', 'Maison Test', 'Paris 9e', now() + interval '7 days', 'A test sale.')"
const insertRequest =
  'INSERT INTO bid_requests (customer_id, auction_id, catalogue_id, lot_number, max_bid_eur, status) VALUES ($1, $2, $3, $4, $5, $6)'

before(async () => {
  client = await pool.connect()
  await client.query('BEGIN')
  ids.alice = await insertId(insertUser, ['alice@example.com', 'test-hash', 'Alice', 'Martin', 'FR'])
  ids.bob = await insertId(insertUser, ['bob@example.com', 'test-hash', 'Bob', 'Smith', 'GB'])
  ids.auction = await insertId(insertAuction, ['schema-test-sale'])
  ids.otherAuction = await insertId(insertAuction, ['schema-test-other-sale'])
  ids.catalogue = await insertId(
    "INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, pdf_url) VALUES ('schema-test-catalogue', $1, 'Test catalogue', '', 1, 100, 'https://example.com/catalogue.pdf')",
    [ids.auction],
  )
  ids.aliceRequest = await insertId(insertRequest, [ids.alice, ids.auction, ids.catalogue, 45, '12500.50', 'accepted'])
})

after(async () => {
  await client.query('ROLLBACK')
  client.release()
  await closePool()
})

test('ids are generated UUIDs', () => {
  assert.match(ids.aliceRequest, /^[0-9a-f-]{36}$/)
})

test('maximum bids are stored exactly as NUMERIC and returned as strings', async () => {
  const { rows } = await client.query<{ max_bid_eur: string }>('SELECT max_bid_eur FROM bid_requests WHERE id = $1', [
    ids.aliceRequest,
  ])
  assert.equal(rows[0]?.max_bid_eur, '12500.50')
})

test('an accepted request reserves the lot against other customers', async () => {
  await expectViolation(insertRequest, [ids.bob, ids.auction, ids.catalogue, 45, '15000', 'accepted'], {
    code: '23505',
    constraint: 'bid_requests_one_reserving_request_per_lot',
  })
})

test('pending requests from other customers are still allowed on a reserved lot', async () => {
  await client.query('SAVEPOINT pending_request')
  await client.query(insertRequest, [ids.bob, ids.auction, ids.catalogue, 45, '15000', 'pending'])
  await client.query('ROLLBACK TO SAVEPOINT pending_request')
})

test('a customer cannot open a second request for the same lot', async () => {
  await expectViolation(insertRequest, [ids.alice, ids.auction, ids.catalogue, 45, '13000', 'pending'], {
    code: '23505',
    constraint: 'bid_requests_one_open_request_per_customer_lot',
  })
})

test("the catalogue must belong to the request's auction", async () => {
  await expectViolation(insertRequest, [ids.bob, ids.otherAuction, ids.catalogue, 12, '500', 'pending'], {
    code: '23503',
    constraint: 'bid_requests_catalogue_auction_fkey',
  })
})

test('maximum bids must be positive and statuses must be known', async () => {
  await expectViolation(insertRequest, [ids.bob, ids.auction, ids.catalogue, 12, '0', 'pending'], {
    code: '23514',
    constraint: 'bid_requests_max_bid_positive',
  })
  await expectViolation(insertRequest, [ids.bob, ids.auction, ids.catalogue, 12, '500', 'approved'], {
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
