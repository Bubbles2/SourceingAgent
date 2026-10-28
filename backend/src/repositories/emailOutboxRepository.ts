import { pool, type Queryable } from '../db/pool.ts'

export type EmailTemplate = 'email_verification' | 'password_reset'

export type OutgoingEmail = {
  to: string
  template: EmailTemplate
  subject: string
  bodyText: string
}

export type StoredEmail = OutgoingEmail & {
  id: string
  createdAt: Date
  sentAt: Date | null
}

export async function enqueueEmail(email: OutgoingEmail, db: Queryable = pool): Promise<void> {
  await db.query('INSERT INTO email_outbox (to_address, template, subject, body_text) VALUES ($1, $2, $3, $4)', [
    email.to,
    email.template,
    email.subject,
    email.bodyText,
  ])
}

export async function listRecentEmails(limit: number, to?: string): Promise<StoredEmail[]> {
  const { rows } = await pool.query<StoredEmail>(
    `SELECT id, to_address AS "to", template, subject, body_text AS "bodyText", created_at AS "createdAt", sent_at AS "sentAt"
     FROM email_outbox
     WHERE $2::text IS NULL OR to_address = $2
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit, to ?? null],
  )
  return rows
}
