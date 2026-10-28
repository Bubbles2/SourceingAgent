// npm run test:cleanup -- e2e-
// Development only. Deletes what automated tests created: accounts (emails <prefix>…@example.com)
// with their bid requests, audit rows, emails, sessions and tokens, and sales (ids <prefix>…) with
// their catalogues and requests. Refuses any other prefix, so it can't touch real customers or sales.
import { config } from '../config/env.ts'
import { closePool, withTransaction } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'

const allowedPrefix = /^(e2e|authtest|bidtest)-[a-z0-9-]*$/

try {
  const prefix = process.argv[2] ?? ''
  if (config.env === 'production') {
    throw new Error('test:cleanup is for development databases only.')
  }
  if (!allowedPrefix.test(prefix)) {
    throw new Error('Pass a test prefix such as e2e- (only e2e-, authtest- and bidtest- accounts can be removed).')
  }
  const pattern = `${prefix}%@example.com`
  const salePattern = `${prefix}%`

  const removed = await withTransaction(async (client) => {
    // The audit trail refuses deletes; lift that for these test rows only, within this transaction.
    await client.query('ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only')
    const history = await client.query(
      `DELETE FROM request_status_history WHERE bid_request_id IN (
         SELECT br.id FROM bid_requests br
         JOIN users u ON u.id = br.customer_id
         JOIN auctions a ON a.id = br.auction_id
         WHERE u.email LIKE $1 OR a.slug LIKE $2)`,
      [pattern, salePattern],
    )
    await client.query('ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only')
    const requests = await client.query(
      `DELETE FROM bid_requests
       WHERE customer_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR auction_id IN (SELECT id FROM auctions WHERE slug LIKE $2)`,
      [pattern, salePattern],
    )
    const catalogues = await client.query(
      'DELETE FROM catalogues WHERE auction_id IN (SELECT id FROM auctions WHERE slug LIKE $1)',
      [salePattern],
    )
    const auctions = await client.query('DELETE FROM auctions WHERE slug LIKE $1', [salePattern])
    const emails = await client.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [pattern])
    // Sessions and one-time tokens go with their users (ON DELETE CASCADE).
    const users = await client.query('DELETE FROM users WHERE email LIKE $1', [pattern])
    return {
      users: users.rowCount,
      auctions: auctions.rowCount,
      catalogues: catalogues.rowCount,
      bidRequests: requests.rowCount,
      history: history.rowCount,
      emails: emails.rowCount,
    }
  })
  logger.info('Removed test accounts', { prefix, ...removed })
} catch (error) {
  logger.error('Could not remove test accounts', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
