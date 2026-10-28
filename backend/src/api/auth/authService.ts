// Account rules: registration, sign-in and sign-out, email verification and password reset.
// Passwords are hashed with Argon2id before anything is stored; session and email tokens are
// stored only as SHA-256 hashes.
import { config } from '../../config/env.ts'
import { withTransaction, type Queryable } from '../../db/pool.ts'
import { isUniqueViolation } from '../../lib/databaseErrors.ts'
import { HttpError } from '../../lib/httpError.ts'
import { logger } from '../../lib/logger.ts'
import {
  consumeAuthToken,
  insertAuthToken,
  retireAuthTokens,
  type AuthTokenPurpose,
} from '../../repositories/authTokensRepository.ts'
import { enqueueEmail } from '../../repositories/emailOutboxRepository.ts'
import { deleteSession, deleteUserSessions, insertSession } from '../../repositories/sessionsRepository.ts'
import {
  findCredentialsByEmail,
  findUserByEmail,
  findUserById,
  insertUser,
  markEmailVerified,
  updatePasswordHash,
  type UserRecord,
} from '../../repositories/usersRepository.ts'
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '../../security/password.ts'
import { generateSecretToken, hashSecretToken } from '../../security/secretTokens.ts'
import { emailVerificationHours, passwordResetEmail, passwordResetMinutes, verificationEmail } from './authEmails.ts'
import type { PasswordResetBody, RegisterBody, SignInBody } from './authValidation.ts'

export type NewSession = {
  sessionId: string
  /** For the cookie only; the database keeps its hash */
  token: string
  expiresAt: Date
}

export type SignedIn = {
  user: UserRecord
  session: NewSession
}

const invalidLink = new HttpError(400, 'invalid_token', 'This link is invalid or has expired. Request a new one.')

async function createSession(userId: string, db: Queryable): Promise<NewSession> {
  const { token, hash } = generateSecretToken()
  const expiresAt = new Date(Date.now() + config.auth.sessionMaxAgeHours * 3_600_000)
  const { id } = await insertSession({ tokenHash: hash, userId, expiresAt }, db)
  return { sessionId: id, token, expiresAt }
}

/** Replaces any outstanding token of the same kind and returns the new one for the email link. */
async function issueAuthToken(userId: string, purpose: AuthTokenPurpose, lifetimeMs: number, db: Queryable): Promise<string> {
  await retireAuthTokens(userId, purpose, db)
  const { token, hash } = generateSecretToken()
  await insertAuthToken({ userId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + lifetimeMs) }, db)
  return token
}

async function sendVerificationEmail(user: UserRecord, db: Queryable): Promise<void> {
  const token = await issueAuthToken(user.id, 'email_verification', emailVerificationHours * 3_600_000, db)
  await enqueueEmail(verificationEmail(user, token), db)
}

/** Creates a customer account, queues the verification email and signs the customer in. */
export async function registerCustomer(input: RegisterBody): Promise<SignedIn> {
  // Hash outside the transaction: it's deliberately slow and needs no database connection.
  const passwordHash = await hashPassword(input.password)

  const signedIn = await withTransaction(async (client) => {
    let user: UserRecord
    try {
      user = await insertUser({ ...input, passwordHash }, client)
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new HttpError(
          409,
          'email_taken',
          'An account already exists for this email address. Sign in instead, or use a different email address.',
        )
      }
      throw error
    }
    await sendVerificationEmail(user, client)
    return { user, session: await createSession(user.id, client) }
  })

  logger.info('Customer registered', { userId: signedIn.user.id })
  return signedIn
}

/**
 * Checks the password and starts a brand-new session. The session the browser arrived with (if
 * any) is ended, so a session id planted before sign-in can never become an authenticated one.
 */
export async function signIn(input: SignInBody, previousSessionId: string | undefined): Promise<SignedIn> {
  const credentials = await findCredentialsByEmail(input.email)
  const passwordMatches = credentials
    ? await verifyPassword(credentials.passwordHash, input.password)
    : await verifyAgainstDummy(input.password)

  if (!credentials || !passwordMatches) {
    logger.warn('Sign-in failed', { reason: credentials ? 'wrong_password' : 'unknown_email' })
    // One message for both cases, so the response doesn't reveal which emails have accounts.
    throw new HttpError(401, 'invalid_credentials', 'The email address or password is incorrect.')
  }

  const { user, passwordHash } = credentials
  const replacementHash = needsRehash(passwordHash) ? await hashPassword(input.password) : null

  const session = await withTransaction(async (client) => {
    if (previousSessionId) {
      await deleteSession(previousSessionId, client)
    }
    if (replacementHash) {
      await updatePasswordHash(user.id, replacementHash, client)
    }
    return createSession(user.id, client)
  })

  logger.info('Signed in', { userId: user.id })
  return { user, session }
}

export async function signOut(sessionId: string): Promise<void> {
  await deleteSession(sessionId)
}

/** Queues a reset email when the account exists. Callers respond the same way either way. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email)
  if (!user) {
    return
  }
  await withTransaction(async (client) => {
    const token = await issueAuthToken(user.id, 'password_reset', passwordResetMinutes * 60_000, client)
    await enqueueEmail(passwordResetEmail(user, token), client)
  })
  logger.info('Password reset requested', { userId: user.id })
}

/**
 * Sets a new password from a reset link and signs the account out everywhere. Opening the
 * link proves the customer owns the address, so it also counts as verifying it.
 */
export async function resetPassword({ token, password }: PasswordResetBody): Promise<void> {
  const passwordHash = await hashPassword(password)
  const userId = await withTransaction(async (client) => {
    const redeemed = await consumeAuthToken(hashSecretToken(token), 'password_reset', client)
    if (!redeemed) {
      throw invalidLink
    }
    await updatePasswordHash(redeemed.userId, passwordHash, client)
    await markEmailVerified(redeemed.userId, client)
    await deleteUserSessions(redeemed.userId, client)
    return redeemed.userId
  })
  logger.info('Password reset', { userId })
}

export async function confirmEmail(token: string): Promise<UserRecord> {
  return withTransaction(async (client) => {
    const redeemed = await consumeAuthToken(hashSecretToken(token), 'email_verification', client)
    if (!redeemed) {
      throw invalidLink
    }
    await markEmailVerified(redeemed.userId, client)
    const user = await findUserById(redeemed.userId, client)
    if (!user) {
      throw invalidLink
    }
    logger.info('Email verified', { userId: user.id })
    return user
  })
}

export async function resendVerificationEmail(user: UserRecord): Promise<void> {
  if (user.emailVerifiedAt) {
    throw new HttpError(409, 'already_verified', 'Your email address is already verified.')
  }
  await withTransaction((client) => sendVerificationEmail(user, client))
}
