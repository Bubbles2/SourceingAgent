// npm run user:role -- someone@example.com administrator
// Changes an existing account's role. Administrators are made here, never through the API.
import { closePool } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { isUserRole, setUserRole, userRoles } from '../repositories/usersRepository.ts'

const [email, role] = process.argv.slice(2)

try {
  if (!email || !role || !isUserRole(role)) {
    throw new Error(`Usage: npm run user:role -- <email> <${userRoles.join('|')}>`)
  }
  const user = await setUserRole(email.trim().toLowerCase(), role)
  if (!user) {
    throw new Error('No account has that email address.')
  }
  logger.info('Role updated', { userId: user.id, role: user.role })
} catch (error) {
  logger.error('Could not update the role', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
