// HTTP behaviour of the real app against the local database: health check, errors, CORS, headers,
// and the request validation middleware.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import express from 'express'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { closePool } from '../src/db/pool.ts'
import { errorHandler } from '../src/middleware/errorHandler.ts'
import { requestContext } from '../src/middleware/requestContext.ts'
import { validate } from '../src/middleware/validate.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Response contracts, checked as well as typed
const healthBody = z.object({
  status: z.enum(['ok', 'unavailable']),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.number(),
  checks: z.object({
    database: z.object({ status: z.enum(['ok', 'unavailable']), latencyMs: z.number().optional() }),
  }),
})
const errorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string(),
  }),
})

async function readError(response: Response): Promise<z.infer<typeof errorBody>['error']> {
  return errorBody.parse(await response.json()).error
}

let api: TestServer

before(async () => {
  api = await startTestServer(createApp())
})

after(async () => {
  await api.close()
  await closePool()
})

describe('GET /api/health', () => {
  test('reports the API and database as ok', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`)
    const body = healthBody.parse(await response.json())

    assert.equal(response.status, 200)
    assert.equal(body.status, 'ok')
    assert.equal(body.checks.database.status, 'ok')
    assert.equal(typeof body.checks.database.latencyMs, 'number')
    assert.equal(response.headers.get('cache-control'), 'no-store')
  })

  test('sends a request id and security headers, and hides the framework', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`)

    assert.match(response.headers.get('x-request-id') ?? '', uuidPattern)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(response.headers.get('content-security-policy'))
    assert.equal(response.headers.get('x-powered-by'), null)
  })
})

describe('errors', () => {
  test('unknown routes return the JSON error shape with the request id', async () => {
    const response = await fetch(`${api.baseUrl}/api/nothing-here`)
    const error = await readError(response)

    assert.equal(response.status, 404)
    assert.equal(error.code, 'not_found')
    assert.equal(error.requestId, response.headers.get('x-request-id'))
  })

  test('malformed JSON is a 400, not a crash', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": ',
    })

    assert.equal(response.status, 400)
    assert.equal((await readError(response)).code, 'invalid_json')
  })

  test('bodies over 100 kB are refused', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(110_000) }),
    })

    assert.equal(response.status, 413)
    assert.equal((await readError(response)).code, 'payload_too_large')
  })
})

describe('CORS', () => {
  test('the configured site origin may call the API with credentials', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, { headers: { Origin: 'http://localhost:3000' } })

    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000')
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
  })

  test('other origins get no CORS headers', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, { headers: { Origin: 'https://evil.example' } })

    assert.equal(response.headers.get('access-control-allow-origin'), null)
  })

  test('preflight requests list the allowed methods', async () => {
    const response = await fetch(`${api.baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' },
    })

    assert.equal(response.status, 204)
    assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  })
})

describe('validate middleware', () => {
  const itemSchema = z.object({ name: z.string().trim().min(1), quantity: z.number().int().positive() })
  let server: TestServer

  before(async () => {
    const app = express()
    app.use(requestContext)
    app.use(express.json())
    app.post('/items', validate({ body: itemSchema }), (_req, res) => {
      res.json(res.locals.validated?.body)
    })
    app.get('/boom', () => {
      throw new Error('connection string postgres://user:secret@db leaked into a message')
    })
    app.use(errorHandler)
    server = await startTestServer(app)
  })

  after(async () => {
    await server.close()
  })

  test('lists every invalid field', async () => {
    const response = await fetch(`${server.baseUrl}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  ', quantity: 1.5 }),
    })
    const error = await readError(response)

    assert.equal(response.status, 400)
    assert.equal(error.code, 'validation_failed')
    assert.deepEqual(
      error.details?.map((detail) => detail.path),
      ['body.name', 'body.quantity'],
    )
  })

  test('passes parsed values on, without unknown keys', async () => {
    const response = await fetch(`${server.baseUrl}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' Vase ', quantity: 2, isAdmin: true }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { name: 'Vase', quantity: 2 })
  })

  test('unexpected errors become a generic 500 that reveals nothing', async () => {
    const response = await fetch(`${server.baseUrl}/boom`)
    const text = await response.text()

    assert.equal(response.status, 500)
    assert.equal(errorBody.parse(JSON.parse(text)).error.code, 'internal_error')
    assert.ok(!text.includes('secret'))
    assert.ok(!text.includes('postgres://'))
  })
})
