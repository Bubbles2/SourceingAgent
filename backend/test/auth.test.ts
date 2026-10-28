// Authentication against the real app and local database. Every account uses a unique
// authtest-<run>-… address and is deleted afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { closePool, pool } from '../src/db/pool.ts'
import { csrfCookieName, sessionCookieName } from '../src/security/cookies.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const runId = randomUUID().slice(0, 8)
const emailPrefix = `authtest-${runId}-`
const password = 'correct horse battery staple'

const userBody = z.object({
  user: z
    .object({
      id: z.uuid(),
      email: z.string(),
      firstName: z.string(),
      role: z.enum(['customer', 'administrator']),
      emailVerified: z.boolean(),
    })
    .loose(),
})
const errorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ path: z.string() })).optional() }),
})

function errorOf(response: ApiResponse): z.infer<typeof errorBody>['error'] {
  return errorBody.parse(response.body).error
}

function userOf(response: ApiResponse): z.infer<typeof userBody>['user'] {
  return userBody.parse(response.body).user
}

function newEmail(label: string): string {
  return `${emailPrefix}${label}@example.com`
}

function registration(email: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { firstName: 'Camille', lastName: 'Durand', email, password, countryCode: 'FR', companyName: '', telephone: '', ...overrides }
}

/** The token from the newest email of one kind sent to an address */
async function tokenFromOutbox(email: string, template: 'email_verification' | 'password_reset'): Promise<string> {
  const { rows } = await pool.query<{ bodyText: string }>(
    'SELECT body_text AS "bodyText" FROM email_outbox WHERE to_address = $1 AND template = $2 ORDER BY created_at DESC LIMIT 1',
    [email, template],
  )
  const token = /#token=([A-Za-z0-9_-]{43})/.exec(rows[0]?.bodyText ?? '')?.[1]
  assert.ok(token, `no ${template} email for ${email}`)
  return token
}

async function registerClient(server: TestServer, label: string): Promise<{ client: BrowserClient; email: string }> {
  const client = new BrowserClient(server.baseUrl)
  const email = newEmail(label)
  const response = await client.post('/api/auth/register', registration(email))
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return { client, email }
}

/**
 * A fresh app for each group of tests, so their sign-ups and sign-ins don't add up against the
 * per-IP rate limits (all requests come from 127.0.0.1).
 */
function serverPerSuite(): () => TestServer {
  let server: TestServer | undefined
  before(async () => {
    server = await startTestServer(createApp())
  })
  after(async () => {
    await server?.close()
  })
  return () => {
    assert.ok(server, 'server not started')
    return server
  }
}

after(async () => {
  await pool.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [`${emailPrefix}%`])
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${emailPrefix}%`])
  await closePool()
})

describe('registration', () => {
  const api = serverPerSuite()

  test('creates a customer, hashes the password with Argon2id and signs them in', async () => {
    const client = new BrowserClient(api().baseUrl)
    const email = newEmail('register')
    const response = await client.post('/api/auth/register', registration(email.toUpperCase()))

    assert.equal(response.status, 201)
    const user = userOf(response)
    assert.equal(user.email, email)
    assert.equal(user.role, 'customer')
    assert.equal(user.emailVerified, false)
    assert.ok(!JSON.stringify(response.body).includes('password'))

    const sessionCookie = response.setCookies.find((cookie) => cookie.startsWith(`${sessionCookieName}=`))
    assert.ok(sessionCookie)
    assert.match(sessionCookie, /HttpOnly/)
    assert.match(sessionCookie, /SameSite=Strict/)
    assert.match(sessionCookie, /Path=\//)

    const { rows } = await pool.query<{ hash: string }>('SELECT password_hash AS hash FROM users WHERE email = $1', [email])
    assert.match(rows[0]?.hash ?? '', /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    assert.ok(!rows[0]?.hash.includes(password))

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(userOf(me).id, user.id)
  })

  test('queues a verification email', async () => {
    const { email } = await registerClient(api(), 'outbox')
    assert.ok(await tokenFromOutbox(email, 'email_verification'))
  })

  test('rejects a duplicate email, whatever its case', async () => {
    const { email } = await registerClient(api(), 'duplicate')
    const response = await new BrowserClient(api().baseUrl).post('/api/auth/register', registration(` ${email.toUpperCase()} `))

    assert.equal(response.status, 409)
    assert.equal(errorOf(response).code, 'email_taken')
  })

  test('validates every field and never accepts a role', async () => {
    const response = await new BrowserClient(api().baseUrl).post(
      '/api/auth/register',
      registration('not-an-email', { password: 'short', countryCode: 'XX', firstName: ' ' }),
    )
    assert.equal(response.status, 400)
    assert.deepEqual(errorOf(response).details?.map((detail) => detail.path).sort(), [
      'body.countryCode',
      'body.email',
      'body.firstName',
      'body.password',
    ])

    const sneaky = await new BrowserClient(api().baseUrl).post(
      '/api/auth/register',
      registration(newEmail('sneaky'), { role: 'administrator' }),
    )
    assert.equal(userOf(sneaky).role, 'customer')
  })
})

describe('sign in and out', () => {
  const api = serverPerSuite()

  test('signs in with the right password and starts a new session', async () => {
    const { client: first, email } = await registerClient(api(), 'login')
    const client = new BrowserClient(api().baseUrl)
    // A session id planted before sign-in must not survive it (session fixation)
    client.cookies.set(sessionCookieName, first.cookies.get(sessionCookieName) ?? '')

    const response = await client.post('/api/auth/login', { email: email.toUpperCase(), password })

    assert.equal(response.status, 200)
    assert.equal(userOf(response).email, email)
    assert.notEqual(client.cookies.get(sessionCookieName), first.cookies.get(sessionCookieName))
    assert.equal((await first.get('/api/auth/me')).status, 401, 'the planted session was ended')
    assert.equal((await client.get('/api/auth/me')).status, 200)
  })

  test('refuses a wrong password and an unknown email with the same message', async () => {
    const { email } = await registerClient(api(), 'wrongpassword')
    const wrong = await new BrowserClient(api().baseUrl).post('/api/auth/login', { email, password: 'incorrect password!' })
    const unknown = await new BrowserClient(api().baseUrl).post('/api/auth/login', {
      email: newEmail('nobody'),
      password,
    })

    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.equal(errorOf(wrong).code, 'invalid_credentials')
    assert.equal(errorOf(wrong).message, errorOf(unknown).message)
    assert.equal(wrong.setCookies.some((cookie) => cookie.startsWith(`${sessionCookieName}=`)), false)
  })

  test('signs out: the cookie is cleared and the session no longer works anywhere', async () => {
    const { client } = await registerClient(api(), 'logout')
    const sessionToken = client.cookies.get(sessionCookieName) ?? ''

    const response = await client.post('/api/auth/logout')
    assert.equal(response.status, 200)
    assert.equal(client.cookies.has(sessionCookieName), false)
    assert.equal((await client.get('/api/auth/me')).status, 401)

    const replay = new BrowserClient(api().baseUrl)
    replay.cookies.set(sessionCookieName, sessionToken)
    assert.equal((await replay.get('/api/auth/me')).status, 401)
  })
})

describe('sessions', () => {
  const api = serverPerSuite()

  test('expire at their maximum age', async () => {
    const { client, email } = await registerClient(api(), 'expired')
    await pool.query(
      "UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )

    const response = await client.get('/api/auth/me')
    assert.equal(response.status, 401)
    assert.equal(errorOf(response).code, 'unauthenticated')
    assert.equal(client.cookies.has(sessionCookieName), false, 'the stale cookie is cleared')
  })

  test('expire after being idle', async () => {
    const { client, email } = await registerClient(api(), 'idle')
    await pool.query(
      "UPDATE sessions SET last_seen_at = now() - interval '13 hours' WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )
    assert.equal((await client.get('/api/auth/me')).status, 401)
  })

  test('visitors are not signed in', async () => {
    const visitor = new BrowserClient(api().baseUrl)
    assert.equal((await visitor.get('/api/auth/me')).status, 401)

    const session = await visitor.get('/api/auth/session')
    assert.equal(session.status, 200)
    assert.deepEqual(session.body, { user: null })
  })

  test('the session endpoint reports the signed-in user', async () => {
    const { client, email } = await registerClient(api(), 'session')
    const response = await client.get('/api/auth/session')
    assert.equal(userOf(response).email, email)
  })
})

describe('CSRF protection', () => {
  const api = serverPerSuite()

  test('changes need the token', async () => {
    const response = await new BrowserClient(api().baseUrl).post('/api/auth/register', registration(newEmail('nocsrf')), {
      csrf: false,
    })
    assert.equal(response.status, 403)
    assert.equal(errorOf(response).code, 'csrf_invalid')
  })

  test('a token from before sign-in stops working after it', async () => {
    const { client } = await registerClient(api(), 'csrfbinding')
    const response = await client.post('/api/auth/logout', undefined, { headers: {}, csrf: false })
    assert.equal(response.status, 403)

    // The anonymous token issued before registration, replayed by hand
    const visitor = new BrowserClient(api().baseUrl)
    const anonymousToken = await visitor.refreshCsrfToken()
    client.cookies.set(csrfCookieName, visitor.cookies.get(csrfCookieName) ?? '')
    const replay = await client.post('/api/auth/logout', undefined, { csrf: false, headers: { 'X-CSRF-Token': anonymousToken } })
    assert.equal(replay.status, 403)
  })

  test('other sites are refused', async () => {
    const response = await new BrowserClient(api().baseUrl).post('/api/auth/login', { email: newEmail('x'), password }, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.equal(response.status, 403)
    assert.equal(errorOf(response).code, 'origin_not_allowed')
  })
})

describe('roles', () => {
  const api = serverPerSuite()

  test('visitors, customers and administrators get different answers from admin endpoints', async () => {
    const visitor = await new BrowserClient(api().baseUrl).get('/api/admin/users')
    assert.equal(visitor.status, 401)

    const { client, email } = await registerClient(api(), 'admin')
    const customer = await client.get('/api/admin/users')
    assert.equal(customer.status, 403)
    assert.equal(errorOf(customer).code, 'forbidden')

    await pool.query("UPDATE users SET role = 'administrator' WHERE email = $1", [email])
    const administrator = await client.get('/api/admin/users?limit=5')
    assert.equal(administrator.status, 200)
    const page = z
      .object({ users: z.array(z.object({ email: z.string() }).loose()), total: z.number(), limit: z.literal(5) })
      .parse(administrator.body)
    assert.ok(page.users.length <= 5)
    assert.ok(!JSON.stringify(page).toLowerCase().includes('password'))

    const invalid = await client.get('/api/admin/users?limit=1000')
    assert.equal(invalid.status, 400)
  })
})

describe('email verification', () => {
  const api = serverPerSuite()

  test('confirms the address once', async () => {
    const { client, email } = await registerClient(api(), 'verify')
    const token = await tokenFromOutbox(email, 'email_verification')

    const confirmed = await new BrowserClient(api().baseUrl).post('/api/auth/email-verification', { token })
    assert.equal(confirmed.status, 200)
    assert.equal(userOf(await client.get('/api/auth/me')).emailVerified, true)

    const again = await new BrowserClient(api().baseUrl).post('/api/auth/email-verification', { token })
    assert.equal(again.status, 400)
    assert.equal(errorOf(again).code, 'invalid_token')

    const resend = await client.post('/api/auth/email-verification/resend')
    assert.equal(resend.status, 409)
  })

  test('a resent link replaces the old one', async () => {
    const { client, email } = await registerClient(api(), 'resend')
    const first = await tokenFromOutbox(email, 'email_verification')
    assert.equal((await client.post('/api/auth/email-verification/resend')).status, 202)
    const second = await tokenFromOutbox(email, 'email_verification')

    assert.notEqual(first, second)
    assert.equal((await client.post('/api/auth/email-verification', { token: first })).status, 400)
    assert.equal((await client.post('/api/auth/email-verification', { token: second })).status, 200)
  })
})

describe('password reset', () => {
  const api = serverPerSuite()

  test('answers the same for unknown emails and sends nothing', async () => {
    const email = newEmail('noaccount')
    const response = await new BrowserClient(api().baseUrl).post('/api/auth/password-reset/request', { email })
    assert.equal(response.status, 202)
    const { rows } = await pool.query('SELECT 1 FROM email_outbox WHERE to_address = $1', [email])
    assert.equal(rows.length, 0)
  })

  test('sets a new password once, signs out everywhere and verifies the email', async () => {
    const { client, email } = await registerClient(api(), 'reset')
    const request = await new BrowserClient(api().baseUrl).post('/api/auth/password-reset/request', { email })
    assert.equal(request.status, 202)
    const token = await tokenFromOutbox(email, 'password_reset')
    const newPassword = 'a brand new passphrase'

    const reset = await new BrowserClient(api().baseUrl).post('/api/auth/password-reset', { token, password: newPassword })
    assert.equal(reset.status, 200)
    assert.equal((await client.get('/api/auth/me')).status, 401, 'existing sessions end')

    const reused = await new BrowserClient(api().baseUrl).post('/api/auth/password-reset', { token, password: newPassword })
    assert.equal(errorOf(reused).code, 'invalid_token')

    const oldPassword = await new BrowserClient(api().baseUrl).post('/api/auth/login', { email, password })
    assert.equal(oldPassword.status, 401)
    const signedIn = await new BrowserClient(api().baseUrl).post('/api/auth/login', { email, password: newPassword })
    assert.equal(signedIn.status, 200)
    assert.equal(userOf(signedIn).emailVerified, true)
  })
})

describe('rate limiting', () => {
  test('repeated sign-in attempts for one account are slowed down', async () => {
    // A separate app, so these attempts don't count against the other tests
    const limited = await startTestServer(createApp())
    try {
      const email = newEmail('bruteforce')
      const statuses: number[] = []
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const response = await new BrowserClient(limited.baseUrl).post('/api/auth/login', { email, password: 'guess number one' })
        statuses.push(response.status)
        if (response.status === 429) {
          assert.equal(errorOf(response).code, 'rate_limited')
          assert.ok(Number(response.headers.get('retry-after')) > 0)
        }
      }
      assert.deepEqual(statuses, [...Array<number>(10).fill(401), 429])
    } finally {
      await limited.close()
    }
  })
})
