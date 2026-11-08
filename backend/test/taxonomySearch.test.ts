// The taxonomy search hooks (taxonomy_search/INTEGRATION.md): the site search /api/search and the admin
// proxy /api/admin/search/*, against a stand-in for the taxonomy search service, so no Python is needed.
// Uses searchtest-<run> accounts and test sales, removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

type Received = { method: string; url: string; token: string | undefined; body: unknown }
type Reply = { status: number; body: unknown; type?: string; headers?: Record<string, string> }

const received: Received[] = []
let reply: (request: Received) => Reply = () => ({ status: 404, body: { detail: 'not found' } })

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

// The stand-in service has to be running, and the app pointed at it, before the app's config is loaded.
const service = createServer((req, res) => {
  void readBody(req).then((body) => {
    const request = { method: req.method ?? '', url: req.url ?? '', token: req.headers['x-service-token'] as string | undefined, body }
    received.push(request)
    const answer = reply(request)
    res.writeHead(answer.status, { 'content-type': answer.type ?? 'application/json', ...answer.headers })
    res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body))
  })
})
await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve))
process.env.TAXONOMY_SERVICE_URL = `http://127.0.0.1:${(service.address() as AddressInfo).port}`
process.env.TAXONOMY_SERVICE_TOKEN = 'stand-in-token'

const { createApp } = await import('../src/app.ts')
const { deleteTestData, insertTestSale } = await import('../src/cli/testSales.ts')
const { closePool, pool, withTransaction } = await import('../src/db/pool.ts')
const { BrowserClient } = await import('./browserClient.ts')
const { startTestServer } = await import('./httpServer.ts')

const run = randomUUID().slice(0, 8)
const prefix = `searchtest-${run}`
let server: Awaited<ReturnType<typeof startTestServer>>
let lots: { id: string; lotNumber: string }[] = []
let auctionId = ''

async function register(label: string, role: 'customer' | 'administrator'): Promise<InstanceType<typeof BrowserClient>> {
  const client = new BrowserClient(server.baseUrl)
  const email = `${prefix}-${label}@example.com`
  const response = await client.post('/api/auth/register', { firstName: 'Test', lastName: label, email, password: 'correct horse battery staple', countryCode: 'FR' })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  await pool.query('UPDATE users SET role = $2, email_verified_at = now() WHERE email = $1', [email, role])
  return client
}

/** The id of the test sale's lot at `index` */
function lotId(index: number): string {
  const lot = lots[index]
  assert.ok(lot, `no test lot ${index}`)
  return lot.id
}

function last(): Received {
  const request = received.at(-1)
  assert.ok(request, 'the service was not called')
  return request
}

before(async () => {
  server = await startTestServer(createApp())
  const sale = await insertTestSale(`${prefix}-sale`, { daysAhead: 30, lotCount: 3 }, pool)
  lots = sale.lots
  auctionId = sale.auctionId
})

after(async () => {
  await withTransaction((client) => deleteTestData(prefix, client))
  await server.close()
  await closePool()
  await new Promise((resolve) => service.close(resolve))
})

function searchReply(direct: unknown[], related: unknown[] = []): Reply {
  return {
    status: 200,
    body: {
      mode: 'broad', taxonomyScope: 'draft', total_direct: direct.length, total_related: related.length, took_ms: 5,
      direct, related, understanding: { concepts: [{ text: 'test object', concepts: ['x.test'] }], unresolved_terms: [] },
      labels: { 'x.test': 'Test object' },
    },
  }
}

describe('site search', () => {
  test('returns the site\'s lots in the service\'s order, with why they matched', async () => {
    reply = () => searchReply(
      [
        { lot_id: Number(lotId(1)), match_type: 'direct', explanation: ['taxonomy: x.test classified_as'] },
        { lot_id: 999999999999, match_type: 'direct', explanation: [] }, // no longer listed: skipped
      ],
      [{ lot_id: Number(lotId(0)), match_type: 'related', explanation: ['semantic similarity 0.70'] }],
    )
    const visitor = new BrowserClient(server.baseUrl)
    const response = await visitor.get('/api/search?q=test%20object')
    assert.equal(response.status, 200, JSON.stringify(response.body))
    const body = response.body as { direct: Record<string, unknown>[]; related: Record<string, unknown>[]; labels: Record<string, string>; understanding: unknown }
    assert.deepEqual(body.direct.map((lot) => lot.id), [lotId(1)])
    const first = body.direct[0]
    assert.ok(first)
    assert.equal(first.saleOpen, true)
    assert.equal(first.matchType, 'direct')
    assert.deepEqual(first.explanation, ['taxonomy: x.test classified_as'])
    assert.equal((first.auction as { id: string }).id, auctionId)
    assert.equal(first.titleUk, 'Test object 2')
    assert.deepEqual(body.related.map((lot) => lot.id), [lotId(0)])
    assert.deepEqual(body.labels, { 'x.test': 'Test object' })
    // The token goes to the service; without a chosen mode the service's default applies.
    assert.equal(last().token, 'stand-in-token')
    assert.deepEqual(last().body, { query: 'test object', limit: 30 })
  })

  test('passes a chosen mode and rejects invalid input', async () => {
    reply = () => searchReply([])
    const visitor = new BrowserClient(server.baseUrl)
    assert.equal((await visitor.get('/api/search?q=test&mode=exact')).status, 200)
    assert.deepEqual(last().body, { query: 'test', mode: 'exact', limit: 30 })
    assert.equal((await visitor.get('/api/search?q=test&mode=fast')).status, 400)
    assert.equal((await visitor.get('/api/search?q=x')).status, 400)
  })

  test('service failures become clear errors', async () => {
    const visitor = new BrowserClient(server.baseUrl)
    reply = () => ({ status: 500, body: { detail: 'boom' } })
    const failed = await visitor.get('/api/search?q=commode')
    assert.equal(failed.status, 502)
    assert.equal((failed.body as { error: { code: string } }).error.code, 'search_failed')
    reply = () => ({ status: 200, body: { unexpected: true } })
    const invalid = await visitor.get('/api/search?q=commode')
    assert.equal((invalid.body as { error: { code: string } }).error.code, 'search_response_invalid')
  })
})

describe('Search administration', () => {
  test('only administrators reach it', async () => {
    reply = () => ({ status: 200, body: { ok: true } })
    const visitor = new BrowserClient(server.baseUrl)
    assert.equal((await visitor.get('/api/admin/search/status')).status, 401)
    const customer = await register('customer', 'customer')
    assert.equal((await customer.get('/api/admin/search/status')).status, 403)
    assert.equal((await customer.post('/api/admin/search/jobs', { command: 'maintain' })).status, 403)
    const calls = received.length
    const admin = await register('admin', 'administrator')
    const status = await admin.get('/api/admin/search/status')
    assert.equal(status.status, 200)
    assert.deepEqual(status.body, { ok: true })
    assert.equal(received.length, calls + 1)
    assert.equal(last().url, '/api/admin/status')
    assert.equal(last().token, 'stand-in-token')
  })

  test('validates before forwarding, and passes the service\'s answers on', async () => {
    const admin = await register('admin2', 'administrator')
    reply = (request) => request.url === '/api/admin/jobs' && request.method === 'POST'
      ? { status: 202, body: { id: '20261108T180645123456-9dd792', status: 'running' } }
      : { status: 404, body: { detail: 'job not found' } }
    const started = await admin.post('/api/admin/search/jobs', { command: 'classify-lots', options: { affected: true } })
    assert.equal(started.status, 202)
    assert.deepEqual(last().body, { command: 'classify-lots', options: { affected: true } })

    const calls = received.length
    assert.equal((await admin.post('/api/admin/search/jobs', { command: 'DROP TABLE' })).status, 400)
    assert.equal((await admin.get('/api/admin/search/jobs/..%2Fsecrets')).status, 400)
    assert.equal((await admin.get('/api/admin/search/reports/..%2Fsecrets')).status, 400)
    assert.equal(received.length, calls, 'invalid requests must not reach the service')

    const missing = await admin.get('/api/admin/search/jobs/20261108T180645123456-000000')
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { error: { message: string } }).error.message, 'Job not found.')

    reply = () => ({ status: 409, body: { detail: 'Maintain is still running' } })
    const busy = await admin.post('/api/admin/search/jobs', { command: 'maintain' })
    assert.equal(busy.status, 409)
    assert.equal((busy.body as { error: { code: string } }).error.code, 'conflict')

    reply = () => ({ status: 200, type: 'text/csv; charset=utf-8', body: '﻿decision,concept_key\n,a.b\n', headers: { 'content-disposition': 'attachment; filename="review_all_candidate.csv"' } })
    const csv = await fetch(`${server.baseUrl}/api/admin/search/taxonomy/export.csv?status=candidate`, {
      headers: { Cookie: [...admin.cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    })
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
    assert.match(csv.headers.get('content-disposition') ?? '', /review_all_candidate\.csv/)
    assert.match(await csv.text(), /decision,concept_key/)
  })
})
