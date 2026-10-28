// Auctions and catalogues: public reads, administrator changes and the rules that tie sales,
// catalogues and bid requests together, against the real app and local database.
// Everything here uses saletest-<run>-… ids and emails, dated four years ahead (or in the past)
// where no other sale is, and is removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { closePool, pool, withTransaction } from '../src/db/pool.ts'
import { todayInParis } from '../src/lib/parisDate.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const run = randomUUID().slice(0, 8)
const prefix = `saletest-${run}`

const catalogueBody = z.strictObject({
  id: z.string(),
  auctionId: z.string(),
  title: z.string(),
  description: z.string(),
  lots: z.strictObject({ first: z.number(), last: z.number() }),
  pageCount: z.number().nullable(),
  pdfUrl: z.string(),
  cover: z.strictObject({ src: z.string(), alt: z.string() }).nullable(),
})
// strictObject throughout: any extra field, such as a database id, fails the parse.
const auctionBody = z.strictObject({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  house: z.string(),
  city: z.string(),
  saleDate: z.iso.date(),
  saleTime: z.string().regex(/^\d{2}:\d{2}$/),
  lotCount: z.number().nullable(),
  viewing: z.strictObject({ start: z.iso.date(), end: z.iso.date() }).nullable(),
  description: z.string(),
  image: z.strictObject({ src: z.string(), alt: z.string() }).nullable(),
  featured: z.boolean(),
  status: z.enum(['draft', 'published', 'cancelled']),
  catalogues: z.array(catalogueBody),
})
const catalogueWithAuctionBody = catalogueBody.extend({
  auction: z.strictObject({
    id: z.string(),
    title: z.string(),
    house: z.string(),
    city: z.string(),
    saleDate: z.iso.date(),
    saleTime: z.string(),
    status: z.enum(['draft', 'published', 'cancelled']),
  }),
})
const page = { total: z.number(), limit: z.number(), offset: z.number() }
const auctionPage = z.strictObject({ auctions: z.array(auctionBody), ...page })
const cataloguePage = z.strictObject({ catalogues: z.array(catalogueWithAuctionBody), ...page })
const errorBody = z.object({
  error: z.object({ code: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() }),
})

function errorCode(response: ApiResponse): string {
  return errorBody.parse(response.body).error.code
}

function errorPaths(response: ApiResponse): string[] {
  return (errorBody.parse(response.body).error.details ?? []).map((detail) => detail.path)
}

function auctionOf(response: ApiResponse): z.infer<typeof auctionBody> {
  return z.object({ auction: auctionBody }).parse(response.body).auction
}

/** A Paris date this many days from today */
function day(offset: number): string {
  const date = new Date(`${todayInParis()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

// Test sales sit about four years ahead, inside the five-year limit and away from sample data.
const ahead = 1460
const window = `from=${day(ahead)}&to=${day(ahead + 30)}`

/** A sale `saleDay` days into the test window, with viewing on the two days before */
function newAuction(id: string, overrides: Record<string, unknown> = {}, saleDay = 10): Record<string, unknown> {
  return {
    id: `${prefix}-${id}`,
    title: 'Test sale',
    category: 'Fine art',
    house: 'Maison Test',
    city: 'Paris 9e',
    saleDate: day(ahead + saleDay),
    saleTime: '14:00',
    lotCount: 200,
    viewing: { start: day(ahead + saleDay - 2), end: day(ahead + saleDay - 1) },
    description: 'A test sale.',
    ...overrides,
  }
}

function newCatalogue(id: string, auction: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `${prefix}-${id}`,
    auctionId: `${prefix}-${auction}`,
    title: `Catalogue ${id}`,
    lots: { first: 1, last: 100 },
    pdfUrl: 'https://example.com/catalogues/test.pdf',
    ...overrides,
  }
}

let server: TestServer
let visitor: BrowserClient
let customer: BrowserClient
let customerId: string
let admin: BrowserClient

async function register(label: string, role: 'customer' | 'administrator'): Promise<{ client: BrowserClient; id: string }> {
  const client = new BrowserClient(server.baseUrl)
  const response = await client.post('/api/auth/register', {
    firstName: 'Test',
    lastName: label,
    email: `${prefix}-${label}@example.com`,
    password: 'correct horse battery staple',
    countryCode: 'FR',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  const id = z.object({ user: z.object({ id: z.string() }).loose() }).parse(response.body).user.id
  await pool.query('UPDATE users SET role = $2, email_verified_at = now() WHERE id = $1', [id, role])
  return { client, id }
}

/** Creates a sale as the administrator and returns it */
async function createAuction(id: string, overrides: Record<string, unknown> = {}, saleDay = 10) {
  const response = await admin.post('/api/auctions', newAuction(id, overrides, saleDay))
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return auctionOf(response)
}

async function createCatalogue(id: string, auction: string, overrides: Record<string, unknown> = {}): Promise<void> {
  const response = await admin.post('/api/catalogues', newCatalogue(id, auction, overrides))
  assert.equal(response.status, 201, JSON.stringify(response.body))
}

/** A completed sale, which the API can't create, straight into the database */
async function insertPastSale(id: string, daysAgo: number): Promise<void> {
  await pool.query(
    `INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, description, status)
     VALUES ($1, 'Past sale', 'Fine art', 'Maison Test', 'Paris', now() - $2::int * interval '1 day', 'A past sale.', 'published')`,
    [`${prefix}-${id}`, daysAgo],
  )
}

before(async () => {
  server = await startTestServer(createApp())
  visitor = new BrowserClient(server.baseUrl)
  admin = (await register('admin', 'administrator')).client
  const signedIn = await register('customer', 'customer')
  customer = signedIn.client
  customerId = signedIn.id

  // Published (with a catalogue), draft and cancelled sales, on different days
  await createAuction('published', { status: 'published', featured: true }, 3)
  await createCatalogue('published-cat', 'published')
  await createAuction('draft', {}, 4)
  await createCatalogue('draft-cat', 'draft')
  await createAuction('cancelled', { status: 'published' }, 5)
  const cancelled = await admin.patch(`/api/auctions/${prefix}-cancelled`, { status: 'cancelled' })
  assert.equal(cancelled.status, 200)
})

after(async () => {
  await server.close()
  await withTransaction(async (client) => {
    await client.query('ALTER TABLE request_status_history DISABLE TRIGGER request_status_history_append_only')
    await client.query(
      `DELETE FROM request_status_history WHERE bid_request_id IN (
         SELECT br.id FROM bid_requests br JOIN auctions a ON a.id = br.auction_id WHERE a.slug LIKE $1)`,
      [`${prefix}-%`],
    )
    await client.query('ALTER TABLE request_status_history ENABLE TRIGGER request_status_history_append_only')
    await client.query('DELETE FROM bid_requests WHERE auction_id IN (SELECT id FROM auctions WHERE slug LIKE $1)', [
      `${prefix}-%`,
    ])
    await client.query('DELETE FROM catalogues WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM auctions WHERE slug LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM email_outbox WHERE to_address LIKE $1', [`${prefix}-%`])
    await client.query('DELETE FROM users WHERE email LIKE $1', [`${prefix}-%`])
  })
  await closePool()
})

describe('reading sales', () => {
  test('visitors see published sales only, each with its catalogues and no database ids', async () => {
    const response = await visitor.get(`/api/auctions?${window}`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control') ?? '', /private/)
    const { auctions, total } = auctionPage.parse(response.body)
    assert.deepEqual(
      auctions.map((auction) => auction.id),
      [`${prefix}-published`],
    )
    assert.equal(total, 1)
    assert.deepEqual(auctions[0]?.catalogues.map((catalogue) => catalogue.id), [`${prefix}-published-cat`])
    assert.doesNotMatch(JSON.stringify(response.body), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/)

    assert.equal((await visitor.get(`/api/auctions/${prefix}-published`)).status, 200)
    for (const hidden of ['draft', 'cancelled', 'missing']) {
      const detail = await visitor.get(`/api/auctions/${prefix}-${hidden}`)
      assert.equal(detail.status, 404, hidden)
      assert.equal(errorCode(detail), 'auction_not_found')
    }
  })

  test('administrators can ask for drafts and cancelled sales; nobody else can', async () => {
    const all = auctionPage.parse((await admin.get(`/api/auctions?${window}&status=all`)).body)
    assert.deepEqual(
      all.auctions.map((auction) => [auction.id, auction.status]),
      [
        [`${prefix}-published`, 'published'],
        [`${prefix}-draft`, 'draft'],
        [`${prefix}-cancelled`, 'cancelled'],
      ],
    )
    const drafts = auctionPage.parse((await admin.get(`/api/auctions?${window}&status=draft`)).body)
    assert.deepEqual(
      drafts.auctions.map((auction) => auction.id),
      [`${prefix}-draft`],
    )
    assert.equal(auctionOf(await admin.get(`/api/auctions/${prefix}-draft`)).status, 'draft')

    assert.equal((await visitor.get(`/api/auctions?${window}&status=draft`)).status, 401)
    assert.equal((await customer.get(`/api/auctions?${window}&status=all`)).status, 403)
    assert.equal((await customer.get(`/api/auctions/${prefix}-draft`)).status, 404)
  })

  test('lists are paged, in sale order: upcoming soonest first, completed latest first', async () => {
    await createAuction('page-1', { status: 'published' }, 20)
    await createAuction('page-2', { status: 'published' }, 21)
    const range = `from=${day(ahead + 20)}&to=${day(ahead + 21)}`

    const first = auctionPage.parse((await visitor.get(`/api/auctions?${range}&limit=1`)).body)
    assert.deepEqual([first.total, first.limit, first.offset], [2, 1, 0])
    assert.deepEqual(first.auctions.map((auction) => auction.id), [`${prefix}-page-1`])
    const second = auctionPage.parse((await visitor.get(`/api/auctions?${range}&limit=1&offset=1`)).body)
    assert.deepEqual(second.auctions.map((auction) => auction.id), [`${prefix}-page-2`])
    const beyond = auctionPage.parse((await visitor.get(`/api/auctions?${range}&offset=5`)).body)
    assert.deepEqual([beyond.auctions.length, beyond.total], [0, 2])

    await insertPastSale('past-older', 401)
    await insertPastSale('past-newer', 400)
    const completed = auctionPage.parse(
      (await visitor.get(`/api/auctions?period=completed&from=${day(-402)}&to=${day(-399)}`)).body,
    )
    assert.deepEqual(
      completed.auctions.map((auction) => auction.id),
      [`${prefix}-past-newer`, `${prefix}-past-older`],
    )
    const upcoming = auctionPage.parse((await visitor.get(`/api/auctions?period=upcoming&from=${day(-402)}&to=${day(-399)}`)).body)
    assert.equal(upcoming.total, 0)
  })

  test('featured sales can be listed on their own', async () => {
    const featured = auctionPage.parse((await visitor.get(`/api/auctions?${window}&featured=true`)).body)
    assert.ok(featured.auctions.length > 0)
    assert.ok(featured.auctions.every((auction) => auction.featured))
  })

  test('list parameters are checked', async () => {
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'from=2027-02-30', `from=${day(5)}&to=${day(4)}`, 'period=soon', 'featured=yes']) {
      const response = await visitor.get(`/api/auctions?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal(errorCode(response), 'validation_failed', query)
    }
  })
})

describe('managing sales', () => {
  test('only administrators can create, change or delete sales, and only with a CSRF token', async () => {
    assert.equal((await visitor.post('/api/auctions', newAuction('nope'))).status, 401)
    assert.equal((await customer.post('/api/auctions', newAuction('nope'))).status, 403)
    assert.equal((await customer.patch(`/api/auctions/${prefix}-published`, { title: 'Mine now' })).status, 403)
    assert.equal((await customer.delete(`/api/auctions/${prefix}-draft`)).status, 403)
    const noToken = await admin.post('/api/auctions', newAuction('no-token'), { csrf: false })
    assert.equal(noToken.status, 403)
    assert.equal(errorCode(noToken), 'csrf_invalid')
  })

  test('a new sale is a draft unless published, with its fields trimmed', async () => {
    const auction = await createAuction('fresh', { title: '  Spaced title  ', lotCount: undefined, viewing: undefined })
    assert.equal(auction.status, 'draft')
    assert.equal(auction.title, 'Spaced title')
    assert.equal(auction.lotCount, null)
    assert.equal(auction.viewing, null)
    assert.equal(auction.featured, false)
    assert.deepEqual(auction.catalogues, [])

    const duplicate = await admin.post('/api/auctions', newAuction('fresh'))
    assert.equal(duplicate.status, 409)
    assert.equal(errorCode(duplicate), 'auction_exists')
  })

  test('required fields, dates, times and links are checked', async () => {
    const empty = await admin.post('/api/auctions', { id: `${prefix}-empty` })
    assert.equal(empty.status, 400)
    assert.deepEqual(errorPaths(empty).sort(), [
      'body.category',
      'body.city',
      'body.description',
      'body.house',
      'body.saleDate',
      'body.saleTime',
      'body.title',
    ])

    const cases: [Record<string, unknown>, string][] = [
      [{ id: 'Not A Slug' }, 'body.id'],
      [{ title: '   ' }, 'body.title'],
      [{ saleDate: '2027-02-30' }, 'body.saleDate'],
      [{ saleDate: day(-1) }, 'body.saleDate'],
      [{ saleDate: day(5 * 366 + 1) }, 'body.saleDate'],
      [{ saleTime: '24:00' }, 'body.saleTime'],
      [{ lotCount: 0 }, 'body.lotCount'],
      [{ viewing: { start: day(ahead + 9), end: day(ahead + 8) } }, 'body.viewing.end'],
      [{ viewing: { start: day(ahead + 9), end: day(ahead + 11) } }, 'body.viewing.end'],
      [{ image: { src: 'http://example.com/a.jpg', alt: 'A lot' } }, 'body.image.src'],
      [{ image: { src: '//example.com/a.jpg', alt: 'A lot' } }, 'body.image.src'],
      [{ image: { src: '/images/a.jpg', alt: '' } }, 'body.image.alt'],
      [{ status: 'postponed' }, 'body.status'],
      [{ databaseId: 'x' }, 'body'],
    ]
    for (const [overrides, path] of cases) {
      const response = await admin.post('/api/auctions', newAuction('checked', overrides))
      assert.equal(response.status, 400, JSON.stringify(overrides))
      assert.ok(errorPaths(response).includes(path), `${JSON.stringify(overrides)}: ${errorPaths(response).join(', ')}`)
    }
  })

  test('changes keep the rules: partial updates, status changes and lot counts', async () => {
    const id = `${prefix}-changed`
    await createAuction('changed')
    await createCatalogue('changed-cat', 'changed', { lots: { first: 1, last: 150 } })

    const renamed = auctionOf(await admin.patch(`/api/auctions/${id}`, { title: 'Renamed sale' }))
    assert.equal(renamed.title, 'Renamed sale')
    assert.equal(renamed.category, 'Fine art', 'fields not sent stay as they were')
    assert.equal(renamed.catalogues.length, 1)

    assert.equal((await admin.patch(`/api/auctions/${id}`, {})).status, 400)
    assert.deepEqual(errorPaths(await admin.patch(`/api/auctions/${id}`, { id: `${prefix}-other` })), ['body'])

    assert.equal(auctionOf(await admin.patch(`/api/auctions/${id}`, { status: 'published' })).status, 'published')
    const backToDraft = await admin.patch(`/api/auctions/${id}`, { status: 'draft' })
    assert.equal(backToDraft.status, 409)
    assert.equal(errorCode(backToDraft), 'invalid_status_change')
    assert.equal(auctionOf(await admin.patch(`/api/auctions/${id}`, { status: 'cancelled' })).status, 'cancelled')
    assert.equal(auctionOf(await admin.patch(`/api/auctions/${id}`, { status: 'published' })).status, 'published')

    const tooFewLots = await admin.patch(`/api/auctions/${id}`, { lotCount: 120 })
    assert.equal(tooFewLots.status, 409)
    assert.equal(errorCode(tooFewLots), 'catalogue_lots_exceed_count')
    assert.equal(auctionOf(await admin.patch(`/api/auctions/${id}`, { lotCount: 150 })).lotCount, 150)

    const viewingAfterSale = await admin.patch(`/api/auctions/${id}`, { saleDate: day(ahead + 7) })
    assert.deepEqual(errorPaths(viewingAfterSale), ['body.viewing.end'])
    const moved = auctionOf(await admin.patch(`/api/auctions/${id}`, { saleDate: day(ahead + 12), saleTime: '19:30' }))
    assert.deepEqual([moved.saleDate, moved.saleTime], [day(ahead + 12), '19:30'])

    assert.equal((await admin.patch(`/api/auctions/${prefix}-missing`, { title: 'x' })).status, 404)
  })

  test('a completed sale can be corrected but not moved into the past', async () => {
    await insertPastSale('past-fix', 30)
    const fixed = await admin.patch(`/api/auctions/${prefix}-past-fix`, { description: 'Corrected description.' })
    assert.equal(fixed.status, 200)
    const moved = await admin.patch(`/api/auctions/${prefix}-past-fix`, { saleDate: day(-31) })
    assert.deepEqual(errorPaths(moved), ['body.saleDate'])
  })

  test('a sale with catalogues is cancelled, not deleted; one without is deleted', async () => {
    const withCatalogue = await admin.delete(`/api/auctions/${prefix}-published`)
    assert.equal(withCatalogue.status, 409)
    assert.equal(errorCode(withCatalogue), 'auction_has_catalogues')

    await createAuction('to-delete')
    assert.equal((await admin.delete(`/api/auctions/${prefix}-to-delete`)).status, 204)
    assert.equal((await admin.get(`/api/auctions/${prefix}-to-delete`)).status, 404)
    assert.equal((await admin.delete(`/api/auctions/${prefix}-to-delete`)).status, 404)
  })
})

describe('catalogues', () => {
  test("visitors see a catalogue exactly when they can see its sale", async () => {
    const published = cataloguePage.parse((await visitor.get(`/api/catalogues?auction=${prefix}-published`)).body)
    assert.deepEqual(published.catalogues.map((catalogue) => catalogue.id), [`${prefix}-published-cat`])
    assert.equal(published.catalogues[0]?.auction.id, `${prefix}-published`)

    const draft = cataloguePage.parse((await visitor.get(`/api/catalogues?auction=${prefix}-draft`)).body)
    assert.equal(draft.total, 0)
    assert.equal((await visitor.get(`/api/catalogues/${prefix}-draft-cat`)).status, 404)
    assert.equal((await visitor.get(`/api/catalogues/${prefix}-published-cat`)).status, 200)

    const asAdmin = await admin.get(`/api/catalogues/${prefix}-draft-cat`)
    assert.equal(z.object({ catalogue: catalogueWithAuctionBody }).parse(asAdmin.body).catalogue.auction.status, 'draft')
    assert.equal((await customer.get(`/api/catalogues?status=draft`)).status, 403)
  })

  test('only administrators can create, change or delete catalogues', async () => {
    assert.equal((await visitor.post('/api/catalogues', newCatalogue('nope', 'published'))).status, 401)
    assert.equal((await customer.post('/api/catalogues', newCatalogue('nope', 'published'))).status, 403)
    assert.equal((await customer.patch(`/api/catalogues/${prefix}-published-cat`, { title: 'x' })).status, 403)
    assert.equal((await customer.delete(`/api/catalogues/${prefix}-published-cat`)).status, 403)
  })

  test('PDF links must be public https:// addresses', async () => {
    for (const pdfUrl of [
      'http://example.com/catalogue.pdf',
      'javascript:alert(1)',
      'https://user:secret@example.com/catalogue.pdf',
      'https://localhost/catalogue.pdf',
      'https://127.0.0.1/catalogue.pdf',
      'not a link',
      `https://example.com/${'a'.repeat(2050)}.pdf`,
    ]) {
      const response = await admin.post('/api/catalogues', newCatalogue('bad-link', 'published', { pdfUrl, lots: { first: 101, last: 110 } }))
      assert.equal(response.status, 400, pdfUrl)
      assert.deepEqual(errorPaths(response), ['body.pdfUrl'], pdfUrl)
    }
  })

  test('lots must fit the sale and not overlap its other catalogues', async () => {
    const backwards = await admin.post('/api/catalogues', newCatalogue('lots', 'published', { lots: { first: 120, last: 110 } }))
    assert.deepEqual(errorPaths(backwards), ['body.lots.last'])

    const beyondSale = await admin.post('/api/catalogues', newCatalogue('lots', 'published', { lots: { first: 101, last: 201 } }))
    assert.deepEqual(errorPaths(beyondSale), ['body.lots.last'])

    const unknownSale = await admin.post('/api/catalogues', newCatalogue('lots', 'missing'))
    assert.deepEqual(errorPaths(unknownSale), ['body.auctionId'])

    const overlapping = await admin.post('/api/catalogues', newCatalogue('lots', 'published', { lots: { first: 100, last: 150 } }))
    assert.equal(overlapping.status, 409)
    assert.equal(errorCode(overlapping), 'lots_overlap')

    await createCatalogue('volume-2', 'published', { lots: { first: 101, last: 200 }, pageCount: 90 })
    const { auction } = z.object({ auction: auctionBody }).parse((await visitor.get(`/api/auctions/${prefix}-published`)).body)
    assert.deepEqual(
      auction.catalogues.map((catalogue) => [catalogue.id, catalogue.lots.first]),
      [
        [`${prefix}-published-cat`, 1],
        [`${prefix}-volume-2`, 101],
      ],
    )

    const duplicate = await admin.post('/api/catalogues', newCatalogue('volume-2', 'draft', { lots: { first: 101, last: 110 } }))
    assert.equal(errorCode(duplicate), 'catalogue_exists')
  })

  test('a catalogue keeps the lots customers have requested', async () => {
    const id = `${prefix}-requested-cat`
    await createAuction('requested', { status: 'published' })
    await createCatalogue('requested-cat', 'requested')
    await pool.query(
      `INSERT INTO bid_requests (customer_id, auction_id, catalogue_id, lot_number, max_bid_eur)
       SELECT $1, c.auction_id, c.id, 50, 1000 FROM catalogues c WHERE c.slug = $2`,
      [customerId, id],
    )

    const narrowed = await admin.patch(`/api/catalogues/${id}`, { lots: { first: 60, last: 100 } })
    assert.equal(narrowed.status, 409)
    assert.equal(errorCode(narrowed), 'requested_lots_outside_range')

    const movedSale = await admin.patch(`/api/catalogues/${id}`, { auctionId: `${prefix}-draft`, lots: { first: 101, last: 150 } })
    assert.equal(errorCode(movedSale), 'catalogue_has_requests')

    const deleted = await admin.delete(`/api/catalogues/${id}`)
    assert.equal(deleted.status, 409)
    assert.equal(errorCode(deleted), 'catalogue_has_requests')

    const renamed = await admin.patch(`/api/catalogues/${id}`, { title: 'Renamed catalogue', lots: { first: 1, last: 120 } })
    assert.equal(renamed.status, 200)
    const { catalogue } = z.object({ catalogue: catalogueWithAuctionBody }).parse(renamed.body)
    assert.deepEqual([catalogue.title, catalogue.lots.last, catalogue.pdfUrl], ['Renamed catalogue', 120, 'https://example.com/catalogues/test.pdf'])
  })

  test('a catalogue nobody has requested from can move sale or be deleted', async () => {
    const moved = await admin.patch(`/api/catalogues/${prefix}-draft-cat`, { auctionId: `${prefix}-cancelled` })
    assert.equal(moved.status, 200)
    assert.equal(z.object({ catalogue: catalogueWithAuctionBody }).parse(moved.body).catalogue.auctionId, `${prefix}-cancelled`)

    assert.equal((await admin.delete(`/api/catalogues/${prefix}-draft-cat`)).status, 204)
    assert.equal((await admin.get(`/api/catalogues/${prefix}-draft-cat`)).status, 404)
    assert.equal((await admin.delete(`/api/catalogues/${prefix}-draft-cat`)).status, 404)
  })
})
