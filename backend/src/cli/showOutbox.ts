// npm run mail:outbox [-- someone@example.com]
// Development only: prints the newest queued emails, including their links, to this terminal
// (not to the logs). Until an email delivery worker exists, this is how to open the links.
import { config } from '../config/env.ts'
import { closePool } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { listRecentEmails } from '../repositories/emailOutboxRepository.ts'

const to = process.argv[2]?.trim().toLowerCase()

try {
  if (config.env === 'production') {
    throw new Error('mail:outbox is for development; it prints sign-in links.')
  }
  const emails = await listRecentEmails(5, to)
  if (emails.length === 0) {
    console.log(to ? `No emails queued for ${to}.` : 'The outbox is empty.')
  }
  for (const email of emails.reverse()) {
    console.log(`\n--- ${email.createdAt.toISOString()} · To: ${email.to} · ${email.subject}\n\n${email.bodyText}\n`)
  }
} catch (error) {
  logger.error('Could not read the outbox', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
