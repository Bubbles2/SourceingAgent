import { pool, type Queryable } from '../db/pool.ts'

export const userRoles = ['customer', 'administrator'] as const
export type UserRole = (typeof userRoles)[number]

/** A user without credentials. password_hash is only ever read by findCredentialsByEmail. */
export type UserRecord = {
  id: string
  email: string
  firstName: string
  lastName: string
  countryCode: string
  companyName: string | null
  telephone: string | null
  role: UserRole
  emailVerifiedAt: Date | null
  createdAt: Date
}

export type UserRow = Omit<UserRecord, 'role'> & { role: string }

export type NewUser = Omit<UserRecord, 'id' | 'role' | 'emailVerifiedAt' | 'createdAt'> & {
  passwordHash: string
}

export const userColumns = `
  u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.country_code AS "countryCode",
  u.company_name AS "companyName", u.telephone, u.role, u.email_verified_at AS "emailVerifiedAt",
  u.created_at AS "createdAt"`

export function isUserRole(value: string): value is UserRole {
  return userRoles.some((role) => role === value)
}

export function toUserRecord(row: UserRow): UserRecord {
  if (!isUserRole(row.role)) {
    throw new Error(`Unknown role on user ${row.id}`)
  }
  return { ...row, role: row.role }
}

export async function insertUser(user: NewUser, db: Queryable = pool): Promise<UserRecord> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users AS u (email, password_hash, first_name, last_name, country_code, company_name, telephone)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${userColumns}`,
    [user.email, user.passwordHash, user.firstName, user.lastName, user.countryCode, user.companyName, user.telephone],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('INSERT INTO users returned no row')
  }
  return toUserRecord(row)
}

export async function findUserById(id: string, db: Queryable = pool): Promise<UserRecord | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${userColumns} FROM users u WHERE u.id = $1`, [id])
  return rows[0] ? toUserRecord(rows[0]) : null
}

export async function findUserByEmail(email: string, db: Queryable = pool): Promise<UserRecord | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${userColumns} FROM users u WHERE u.email = $1`, [email])
  return rows[0] ? toUserRecord(rows[0]) : null
}

/** The only query that reads password hashes; used to check a password at sign-in. */
export async function findCredentialsByEmail(email: string): Promise<{ user: UserRecord; passwordHash: string } | null> {
  const { rows } = await pool.query<UserRow & { passwordHash: string }>(
    `SELECT ${userColumns}, u.password_hash AS "passwordHash" FROM users u WHERE u.email = $1`,
    [email],
  )
  const row = rows[0]
  if (!row) {
    return null
  }
  const { passwordHash, ...user } = row
  return { user: toUserRecord(user), passwordHash }
}

export async function updatePasswordHash(userId: string, passwordHash: string, db: Queryable = pool): Promise<void> {
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash])
}

export async function markEmailVerified(userId: string, db: Queryable = pool): Promise<void> {
  await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL', [userId])
}

export async function setUserRole(email: string, role: UserRole): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users AS u SET role = $2 WHERE u.email = $1 RETURNING ${userColumns}`,
    [email, role],
  )
  return rows[0] ? toUserRecord(rows[0]) : null
}

export async function listUsers({ limit, offset }: { limit: number; offset: number }): Promise<{ users: UserRecord[]; total: number }> {
  const [page, count] = await Promise.all([
    pool.query<UserRow>(`SELECT ${userColumns} FROM users u ORDER BY u.created_at DESC, u.id LIMIT $1 OFFSET $2`, [
      limit,
      offset,
    ]),
    pool.query<{ total: number }>('SELECT count(*)::int AS total FROM users'),
  ])
  return { users: page.rows.map(toUserRecord), total: count.rows[0]?.total ?? 0 }
}
