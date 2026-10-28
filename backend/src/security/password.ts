// Argon2id password hashing with Node's built-in crypto.argon2 (Node 24.7+). Hashes are stored in the
// standard PHC string format, so the parameters travel with each hash and can be raised later.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(argon2)

// OWASP's minimum Argon2id configuration: 19 MiB of memory, 2 passes, 1 lane.
const current = { memory: 19_456, passes: 2, parallelism: 1 } as const
const saltBytes = 16
const hashBytes = 32

// Bounds for parameters read back from stored hashes, so a corrupt row can't exhaust the server
const limits = { memory: 1_048_576, passes: 20, parallelism: 16 } as const

type HashParameters = { memory: number; passes: number; parallelism: number }

type ParsedHash = HashParameters & { salt: Buffer; hash: Buffer }

const phcPattern = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

function toBase64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '')
}

// Visually identical passwords can be typed as different code points; compare them in one form.
function normalize(password: string): string {
  return password.normalize('NFC')
}

function derive(password: string, salt: Buffer, parameters: HashParameters, tagLength: number): Promise<Buffer> {
  return deriveKey('argon2id', {
    message: normalize(password),
    nonce: salt,
    memory: parameters.memory,
    passes: parameters.passes,
    parallelism: parameters.parallelism,
    tagLength,
  })
}

function parseHash(stored: string): ParsedHash | null {
  const match = phcPattern.exec(stored)
  if (!match) {
    return null
  }
  const [, memory, passes, parallelism, salt, hash] = match
  const parsed = {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    salt: Buffer.from(salt ?? '', 'base64'),
    hash: Buffer.from(hash ?? '', 'base64'),
  }
  const withinLimits =
    parsed.memory >= 8 * parsed.parallelism &&
    parsed.memory <= limits.memory &&
    parsed.passes >= 1 &&
    parsed.passes <= limits.passes &&
    parsed.parallelism >= 1 &&
    parsed.parallelism <= limits.parallelism &&
    parsed.salt.length >= 8 &&
    parsed.hash.length >= 16
  return withinLimits ? parsed : null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes)
  const hash = await derive(password, salt, current, hashBytes)
  return `$argon2id$v=19$m=${current.memory},t=${current.passes},p=${current.parallelism}$${toBase64(salt)}$${toBase64(hash)}`
}

/** Constant-time check of a password against a stored hash. Unreadable hashes never match. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parsed = parseHash(stored)
  if (!parsed) {
    return false
  }
  const candidate = await derive(password, parsed.salt, parsed, parsed.hash.length)
  return timingSafeEqual(candidate, parsed.hash)
}

/** True when a hash was made with weaker settings than today's, so it should be replaced at sign-in. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored)
  return (
    !parsed ||
    parsed.memory < current.memory ||
    parsed.passes < current.passes ||
    parsed.parallelism !== current.parallelism ||
    parsed.hash.length !== hashBytes
  )
}

let dummyHash: Promise<string> | undefined

/**
 * Spends the same time as a real check when no account matches, so response times don't reveal
 * which email addresses are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(await dummyHash, password)
  return false
}
