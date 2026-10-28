import { pool, type Queryable } from '../db/pool.ts'
import { toUserRecord, userColumns, type UserRecord, type UserRow } from './usersRepository.ts'

export type ActiveSession = {
  id: string
  lastSeenAt: Date
  expiresAt: Date
  user: UserRecord
}

type SessionRow = UserRow & {
  sessionId: string
  lastSeenAt: Date
  expiresAt: Date
}

export async function insertSession(
  session: { tokenHash: Buffer; userId: string; expiresAt: Date },
  db: Queryable = pool,
): Promise<{ id: string }> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3) RETURNING id',
    [session.tokenHash, session.userId, session.expiresAt],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('INSERT INTO sessions returned no row')
  }
  return row
}

/** The session for a cookie, if it is neither past its maximum age nor idle for too long. */
export async function findActiveSession(tokenHash: Buffer, idleMinutes: number): Promise<ActiveSession | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT s.id AS "sessionId", s.last_seen_at AS "lastSeenAt", s.expires_at AS "expiresAt", ${userColumns}
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND s.last_seen_at > now() - make_interval(mins => $2)`,
    [tokenHash, idleMinutes],
  )
  const row = rows[0]
  if (!row) {
    return null
  }
  const { sessionId, lastSeenAt, expiresAt, ...user } = row
  return { id: sessionId, lastSeenAt, expiresAt, user: toUserRecord(user) }
}

export async function touchSession(sessionId: string): Promise<void> {
  await pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sessionId])
}

export async function deleteSession(sessionId: string, db: Queryable = pool): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId])
}

export async function deleteSessionByTokenHash(tokenHash: Buffer): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
}

/** Signs the user out everywhere, e.g. after a password reset. */
export async function deleteUserSessions(userId: string, db: Queryable = pool): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export async function deleteExpiredSessions(idleMinutes: number): Promise<number> {
  const { rowCount } = await pool.query(
    'DELETE FROM sessions WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(mins => $1)',
    [idleMinutes],
  )
  return rowCount ?? 0
}
