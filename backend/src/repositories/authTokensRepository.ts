import { pool, type Queryable } from '../db/pool.ts'

export type AuthTokenPurpose = 'email_verification' | 'password_reset'

export async function insertAuthToken(
  token: { userId: string; purpose: AuthTokenPurpose; tokenHash: Buffer; expiresAt: Date },
  db: Queryable = pool,
): Promise<void> {
  await db.query('INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [
    token.userId,
    token.purpose,
    token.tokenHash,
    token.expiresAt,
  ])
}

/** Invalidates a user's unused tokens of one kind, so only the newest link works. */
export async function retireAuthTokens(userId: string, purpose: AuthTokenPurpose, db: Queryable = pool): Promise<void> {
  await db.query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [
    userId,
    purpose,
  ])
}

/**
 * Redeems a token in one statement, so two simultaneous requests can't both use it.
 * Returns the user it belongs to, or null if it is unknown, used or expired.
 */
export async function consumeAuthToken(
  tokenHash: Buffer,
  purpose: AuthTokenPurpose,
  db: Queryable = pool,
): Promise<{ userId: string } | null> {
  const { rows } = await db.query<{ userId: string }>(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id AS "userId"`,
    [tokenHash, purpose],
  )
  return rows[0] ?? null
}
