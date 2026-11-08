// Sales for automated tests, and the clean-up afterwards. Real sales are the Drouot collector's,
// which the app only reads; test sales go into the app's own test_auctions and test_lots tables,
// which the auctions and lots views add to the collector's. Their external ids start with a test
// prefix, so the clean-up can find them, and it never touches anything but the test tables.
import type { Queryable } from '../db/pool.ts'

/** Prefixes automated tests use for accounts and sales */
export const testPrefixPattern = /^(e2e|authtest|bidtest)-[a-z0-9-]*$/

/**
 * Deletes what tests made under a prefix: accounts (emails <prefix>…@example.com) with their bid
 * requests, audit rows, emails, sessions and tokens, and test sales (external ids <prefix>…) with
 * their lots and requests. Call it inside a transaction: the audit trail's append-only rule is lifted
 * for these rows only, until the statement after the delete.
 */
export async function deleteTestData(prefix: string, db: Queryable): Promise<Record<string, number | null>> {
  const emails = `${prefix}%@example.com`
  const sales = `${prefix}%`
  const testRequests = `SELECT id FROM bid_requests
    WHERE customer_id IN (SELECT id FROM users WHERE email LIKE $1)
       OR auction_id IN (SELECT id FROM test_auctions WHERE external_id LIKE $2)`

  await db.query('ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only')
  const history = await db.query(`DELETE FROM request_status_history WHERE bid_request_id IN (${testRequests})`, [
    emails,
    sales,
  ])
  await db.query('ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only')
  const requests = await db.query(`DELETE FROM bid_requests WHERE id IN (${testRequests})`, [emails, sales])
  const lots = await db.query(
    'DELETE FROM test_lots WHERE auction_id IN (SELECT id FROM test_auctions WHERE external_id LIKE $1)',
    [sales],
  )
  const auctions = await db.query('DELETE FROM test_auctions WHERE external_id LIKE $1', [sales])
  const outbox = await db.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [emails])
  // Sessions and one-time tokens go with their users (ON DELETE CASCADE).
  const users = await db.query('DELETE FROM users WHERE email LIKE $1', [emails])
  return {
    users: users.rowCount,
    auctions: auctions.rowCount,
    lots: lots.rowCount,
    bidRequests: requests.rowCount,
    history: history.rowCount,
    emails: outbox.rowCount,
  }
}

export type TestSale = {
  auctionId: string
  lots: { id: string; lotNumber: string }[]
}

/**
 * Adds a sale `daysAhead` days from today (negative for a completed sale) at `time` in Paris, with
 * lots numbered from 1 to `lotCount`.
 */
export async function insertTestSale(
  externalId: string,
  {
    daysAhead,
    time = '14:00',
    lotCount = 3,
    title = `Test sale ${externalId}`,
  }: { daysAhead: number; time?: string; lotCount?: number; title?: string },
  db: Queryable,
): Promise<TestSale> {
  const saleDay = `((now() AT TIME ZONE 'Europe/Paris')::date + $3::int)`
  const auctions = await db.query<{ id: string }>(
    `INSERT INTO test_auctions (external_id, title, starts_at, auction_date, location, catalogue_url, source_url)
     VALUES ($1, $2, (${saleDay} + $5::time) AT TIME ZONE 'Europe/Paris', ${saleDay}, 'Paris', $4, $4)
     RETURNING id`,
    [externalId, title, daysAhead, `https://example.com/sales/${externalId}`, time],
  )
  const auctionId = auctions.rows[0]?.id
  if (!auctionId) {
    throw new Error('INSERT INTO test_auctions returned no row')
  }
  const lots = await db.query<{ id: string; lotNumber: string }>(
    `INSERT INTO test_lots (auction_id, external_id, lot_number, title, description, titleuk, descriptionuk, category, currency,
       source_url)
     SELECT $1, $2 || '-' || n, n::text, n || ' - Objet ' || n, 'Objet de test ' || n, 'Test object ' || n,
       'A test object, number ' || n || '.', 'Test', 'EUR', 'https://example.com/lots/' || $2 || '-' || n
     FROM generate_series(1, $3::int) AS n
     ORDER BY n
     RETURNING id, lot_number AS "lotNumber"`,
    [auctionId, externalId, lotCount],
  )
  return { auctionId, lots: lots.rows }
}
