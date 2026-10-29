// npm run test:cleanup -- e2e-
// Development only. Deletes what automated tests created under a prefix: accounts and test sales,
// with everything that belongs to them (see deleteTestData). Refuses any other prefix, so it can't
// touch real customers or collected sales.
import { config } from '../config/env.ts'
import { closePool, withTransaction } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { deleteTestData, testPrefixPattern } from './testSales.ts'

try {
  const prefix = process.argv[2] ?? ''
  if (config.env === 'production') {
    throw new Error('test:cleanup is for development databases only.')
  }
  if (!testPrefixPattern.test(prefix)) {
    throw new Error('Pass a test prefix such as e2e- (only e2e-, authtest- and bidtest- accounts can be removed).')
  }
  const removed = await withTransaction((client) => deleteTestData(prefix, client))
  logger.info('Removed test accounts', { prefix, ...removed })
} catch (error) {
  logger.error('Could not remove test accounts', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
