// Auctions and lots, as the auction monitor collected them: public reads only, against the real app
// and local database. Everything here uses saletest-<run>-… ids, dated four years ahead (or in the
// past) where no collected sale is, and is removed afterwards.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.ts'
import { deleteTestData, insertTestSale, type TestSale } from '../src/cli/testSales.ts'
import { closePool, pool, withTransaction } from '../src/db/pool.ts'
import { todayInParis } from '../src/lib/parisDate.ts'
import { BrowserClient, type ApiResponse } from './browserClient.ts'
import { startTestServer, type TestServer } from './httpServer.ts'

const run = randomUUID().slice(0, 8)
const prefix = `saletest-${run}`

// strictObject throughout: any extra field, such as the raw collected data, fails the parse.
const auctionBody = z.strictObject({
  id: z.string().regex(/^\d+$/),
  externalId: z.string(),
  title: z.string(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  auctionDate: z.iso.date().nullable(),
  location: z.string().nullable(),
  catalogueUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  status: z.string().nullable(),
  lotCount: z.number(),
})
const lotBody = z.strictObject({
  id: z.string().regex(/^\d+$/),
  auctionId: z.string(),
  externalId: z.string(),
  lotNumber: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  maker: z.string().nullable(),
  materials: z.array(z.string()),
  estimateLow: z.string().nullable(),
  estimateHigh: z.string().nullable(),
  currency: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  titleUk: z.string().nullable(),
  descriptionUk: z.string().nullable(),
  aiCategory: z.string().nullable(),
  aiSummary: z.string().nullable(),
  auction: z.strictObject({
    id: z.string(),
    title: z.string(),
    startsAt: z.iso.datetime().nullable(),
    auctionDate: z.iso.date().nullable(),
    location: z.string().nullable(),
  }),
})
const page = { total: z.number(), limit: z.number(), offset: z.number() }
const auctionPage = z.strictObject({ auctions: z.array(auctionBody), ...page })
const lotPage = z.strictObject({ lots: z.array(lotBody), ...page })
const lotSummaries = z.strictObject({
  lots: z.array(z.strictObject({ id: z.string(), lotNumber: z.string().nullable(), title: z.string().nullable(), titleUk: z.string().nullable() })),
})
const errorBody = z.object({ error: z.object({ code: z.string() }) })

function errorCode(response: ApiResponse): string {
  return errorBody.parse(response.body).error.code
}

/** A Paris date this many days from today */
function day(offset: number): string {
  const date = new Date(`${todayInParis()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

// Test sales sit about four years ahead, away from collected sales.
const ahead = 1460
const window = `from=${day(ahead)}&to=${day(ahead + 30)}`

let server: TestServer
let visitor: BrowserClient
const sales = new Map<string, TestSale>()

async function createSale(label: string, daysAhead: number, lotCount = 3): Promise<TestSale> {
  const sale = await insertTestSale(`${prefix}-${label}`, { daysAhead, lotCount, title: `Sale ${label}` }, pool)
  sales.set(label, sale)
  return sale
}

function saleId(label: string): string {
  const sale = sales.get(label)
  assert.ok(sale, `no sale ${label}`)
  return sale.auctionId
}

before(async () => {
  server = await startTestServer(createApp())
  visitor = new BrowserClient(server.baseUrl)

  // A sale as the monitor collects it from a page: entities in its text, and one link that isn't safe.
  const collected = await createSale('collected', ahead + 3, 2)
  await pool.query(
    `UPDATE auctions SET title = 'Fine Arts &amp; Antiques &#8212; Day&nbsp;1', location = 'Drouot &quot;Richelieu&quot;',
       catalogue_url = 'javascript:alert(1)', source_url = 'https://drouot.com/fr/v/1', raw_data = '{"secret": true}'
     WHERE id = $1`,
    [collected.auctionId],
  )
  await pool.query(
    `UPDATE lots SET titleuk = 'Bronze &amp; Marble Buddha', image_url = 'http://insecure.example/a.jpg',
       estimate_low = 1500, estimate_high = 2000, materials = '{bronze,marble}'
     WHERE id = $1`,
    [collected.lots[0]?.id],
  )
  await createSale('later', ahead + 5)
})

after(async () => {
  await server.close()
  await withTransaction((client) => deleteTestData(prefix, client))
  await closePool()
})

describe('reading sales', () => {
  test('anyone can list sales, named after the monitor’s columns, with their lot counts', async () => {
    const response = await visitor.get(`/api/auctions?${window}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-cache')
    const { auctions, total } = auctionPage.parse(response.body)
    assert.deepEqual(
      auctions.map((auction) => [auction.id, auction.title, auction.lotCount]),
      [
        [saleId('collected'), 'Fine Arts & Antiques — Day 1', 2],
        [saleId('later'), 'Sale later', 3],
      ],
    )
    assert.equal(total, 2)
    const later = auctions[1]
    assert.equal(later?.auctionDate, day(ahead + 5))
    assert.equal(later?.externalId, `${prefix}-later`)
    // 14:00 in Paris
    assert.equal(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(
        new Date(later?.startsAt ?? ''),
      ),
      '14:00',
    )
  })

  test('collected text is decoded, and only public https:// links are passed on', async () => {
    const response = await visitor.get(`/api/auctions/${saleId('collected')}`)
    const { auction } = z.object({ auction: auctionBody }).parse(response.body)
    assert.equal(auction.location, 'Drouot "Richelieu"')
    assert.equal(auction.catalogueUrl, null)
    assert.equal(auction.sourceUrl, 'https://drouot.com/fr/v/1')
    assert.doesNotMatch(JSON.stringify(response.body), /secret/)
  })

  test('unknown or malformed sale ids are not found', async () => {
    for (const id of ['999999999999', 'abc', '0', '1.5', `${prefix}-later`]) {
      const response = await visitor.get(`/api/auctions/${id}`)
      assert.equal(response.status, 404, id)
      assert.equal(errorCode(response), 'auction_not_found', id)
      assert.equal((await visitor.get(`/api/auctions/${id}/lots`)).status, 404, `${id}/lots`)
    }
  })

  test('lists are paged, in sale order: upcoming soonest first, completed latest first', async () => {
    await createSale('page-1', ahead + 20)
    await createSale('page-2', ahead + 21)
    const range = `from=${day(ahead + 20)}&to=${day(ahead + 21)}`

    const first = auctionPage.parse((await visitor.get(`/api/auctions?${range}&limit=1`)).body)
    assert.deepEqual([first.total, first.limit, first.offset], [2, 1, 0])
    assert.deepEqual(first.auctions.map((auction) => auction.id), [saleId('page-1')])
    const second = auctionPage.parse((await visitor.get(`/api/auctions?${range}&limit=1&offset=1`)).body)
    assert.deepEqual(second.auctions.map((auction) => auction.id), [saleId('page-2')])
    const beyond = auctionPage.parse((await visitor.get(`/api/auctions?${range}&offset=5`)).body)
    assert.deepEqual([beyond.auctions.length, beyond.total], [0, 2])

    await createSale('past-older', -401)
    await createSale('past-newer', -400)
    const completed = auctionPage.parse(
      (await visitor.get(`/api/auctions?period=completed&from=${day(-402)}&to=${day(-399)}`)).body,
    )
    assert.deepEqual(completed.auctions.map((auction) => auction.id), [saleId('past-newer'), saleId('past-older')])
    const upcoming = auctionPage.parse((await visitor.get(`/api/auctions?period=upcoming&from=${day(-402)}&to=${day(-399)}`)).body)
    assert.equal(upcoming.total, 0)
  })

  test('a sale with only a sale day is placed on that day; one with no date is never upcoming', async () => {
    const dayOnly = await createSale('day-only', ahead + 25)
    await pool.query('UPDATE auctions SET starts_at = NULL WHERE id = $1', [dayOnly.auctionId])
    const undated = await createSale('undated', ahead + 26)
    await pool.query('UPDATE auctions SET starts_at = NULL, auction_date = NULL WHERE id = $1', [undated.auctionId])

    const listed = auctionPage.parse((await visitor.get(`/api/auctions?period=upcoming&from=${day(ahead + 25)}&to=${day(ahead + 26)}`)).body)
    assert.deepEqual(
      listed.auctions.map((auction) => [auction.id, auction.startsAt, auction.auctionDate]),
      [[dayOnly.auctionId, null, day(ahead + 25)]],
    )
    const upcoming = auctionPage.parse((await visitor.get('/api/auctions?period=upcoming&limit=100')).body)
    assert.ok(upcoming.auctions.every((auction) => auction.id !== undated.auctionId))
  })

  test('list parameters are checked', async () => {
    for (const query of ['limit=0', 'limit=101', 'offset=-1', 'from=2027-02-30', `from=${day(5)}&to=${day(4)}`, 'period=soon']) {
      const response = await visitor.get(`/api/auctions?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal(errorCode(response), 'validation_failed', query)
    }
  })
})

describe('reading lots', () => {
  test("a sale's lots come in catalogue order, numbered lots by their number", async () => {
    const sale = await createSale('numbers', ahead + 7, 1)
    await pool.query(
      `INSERT INTO lots (auction_id, external_id, lot_number, title, source_url)
       SELECT $1, $2 || '-' || n, n, 'Lot ' || n, 'https://example.com/lot'
       FROM unnest(ARRAY['10', '9', '9A', '100']) AS n`,
      [sale.auctionId, `${prefix}-numbers-extra`],
    )
    await pool.query(
      "INSERT INTO lots (auction_id, external_id, lot_number, source_url) VALUES ($1, $2, NULL, 'https://example.com/lot')",
      [sale.auctionId, `${prefix}-numbers-unnumbered`],
    )
    const response = await visitor.get(`/api/auctions/${sale.auctionId}/lots`)
    assert.equal(response.status, 200)
    assert.deepEqual(
      lotSummaries.parse(response.body).lots.map((lot) => lot.lotNumber),
      ['1', '9', '9A', '10', '100', null],
    )
  })

  test('lots can be listed by sale and period, each with its sale, paged', async () => {
    const all = lotPage.parse((await visitor.get(`/api/lots?auction=${saleId('collected')}`)).body)
    assert.equal(all.total, 2)
    const [first] = all.lots
    assert.deepEqual(first?.auction, {
      id: saleId('collected'),
      title: 'Fine Arts & Antiques — Day 1',
      startsAt: first?.auction.startsAt,
      auctionDate: day(ahead + 3),
      location: 'Drouot "Richelieu"',
    })
    assert.equal(first?.titleUk, 'Bronze & Marble Buddha')
    assert.equal(first?.imageUrl, null, 'http:// images are not passed on')
    assert.deepEqual([first?.estimateLow, first?.estimateHigh, first?.currency], ['1500.00', '2000.00', 'EUR'])
    assert.deepEqual(first?.materials, ['bronze', 'marble'])

    const second = lotPage.parse((await visitor.get(`/api/lots?auction=${saleId('collected')}&limit=1&offset=1`)).body)
    assert.deepEqual(second.lots.map((lot) => lot.lotNumber), ['2'])

    const completed = lotPage.parse((await visitor.get(`/api/lots?auction=${saleId('collected')}&period=completed`)).body)
    assert.equal(completed.total, 0)
  })

  test('list parameters are checked', async () => {
    for (const query of ['auction=abc', 'auction=0', 'period=soon', 'limit=101']) {
      const response = await visitor.get(`/api/lots?${query}`)
      assert.equal(response.status, 400, query)
      assert.equal(errorCode(response), 'validation_failed', query)
    }
  })
})
