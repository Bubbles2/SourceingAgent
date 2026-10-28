import { createHash, randomBytes } from 'node:crypto'

export type SecretToken = {
  /** Given to the browser or put in an email link; never stored */
  token: string
  /** SHA-256 of the token, which is what the database keeps */
  hash: Buffer
}

/** 256 random bits, URL-safe. Used for session cookies and one-time email links. */
export function generateSecretToken(): SecretToken {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashSecretToken(token) }
}

export function hashSecretToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}
