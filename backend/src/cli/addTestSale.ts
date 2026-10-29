// npm run sale:test -- e2e-abc-sale [days ahead, default 7] [lots, default 3] [Paris time, default 14:00]
// Development only. Adds a sale for automated tests (testSales.ts) and prints its ids as JSON.
// Only test ids are accepted, so npm run test:cleanup -- e2e- removes it again.
import { config } from '../config/env.ts'
import { closePool, withTransaction } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { insertTestSale, testPrefixPattern } from './testSales.ts'

const [externalId = '', daysAhead = '7', lotCount = '3', time = '14:00'] = process.argv.slice(2)

try {
  if (config.env === 'production') {
    throw new Error('sale:test is for development databases only.')
  }
  if (!testPrefixPattern.test(externalId)) {
    throw new Error('Pass a test sale id such as e2e-abc-sale (only e2e-, authtest- and bidtest- ids).')
  }
  if (!/^-?\d+$/.test(daysAhead) || !/^\d+$/.test(lotCount) || Number(lotCount) < 1 || Number(lotCount) > 500) {
    throw new Error('Days ahead must be a whole number, and lots a whole number from 1 to 500.')
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Give the sale time in 24-hour Paris time, such as 14:30.')
  }
  const sale = await withTransaction((client) =>
    insertTestSale(externalId, { daysAhead: Number(daysAhead), lotCount: Number(lotCount), time }, client),
  )
  console.log(JSON.stringify(sale))
} catch (error) {
  logger.error('Could not add the test sale', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
