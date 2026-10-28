// npm run db:seed — development only. Loads the website's sample auctions and catalogues
// (src/mocks/*.ts) into PostgreSQL so bid requests can reference them, plus a few accepted requests
// from sample customers so Requested lots and the "lot already reserved" rule have data.
// Safe to run again: rows are matched by slug or email and updated in place.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config/env.ts'
import { closePool, withTransaction, type Queryable } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { hashPassword } from '../security/password.ts'

const isoDate = z.iso.date()
const image = z.object({ src: z.string(), alt: z.string() }).optional()

const auctionSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  house: z.string(),
  city: z.string(),
  saleDate: isoDate,
  saleTime: z.string().regex(/^\d{2}:\d{2}$/),
  lotCount: z.number().int().positive(),
  viewing: z.object({ start: isoDate, end: isoDate }),
  description: z.string(),
  image,
  featured: z.boolean().optional(),
})

const catalogueSchema = z.object({
  id: z.string(),
  auctionId: z.string(),
  title: z.string(),
  description: z.string(),
  lots: z.object({ first: z.number().int(), last: z.number().int() }),
  pageCount: z.number().int().positive(),
  pdfUrl: z.url(),
  cover: image,
})

type SampleRequest = {
  customer: string
  catalogue: string
  lot: number
  maxBidEur: number
  status: 'pending' | 'accepted' | 'won'
}

// Other customers' requests from the prototype's sample data (src/mocks/bidRequests.ts)
const sampleRequests: readonly SampleRequest[] = [
  { customer: '0142', catalogue: 'vauclair-tableaux-anciens', lot: 45, maxBidEur: 6000, status: 'accepted' },
  { customer: '0217', catalogue: 'vauclair-tableaux-anciens', lot: 102, maxBidEur: 2500, status: 'accepted' },
  { customer: '0217', catalogue: 'vauclair-tableaux-anciens', lot: 46, maxBidEur: 1500, status: 'pending' },
  { customer: '0088', catalogue: 'saint-honore-arts-decoratifs', lot: 12, maxBidEur: 8000, status: 'accepted' },
  { customer: '0301', catalogue: 'marchal-livres-volume-2', lot: 233, maxBidEur: 3200, status: 'accepted' },
  { customer: '0142', catalogue: 'bastille-design', lot: 7, maxBidEur: 5400, status: 'accepted' },
  { customer: '0088', catalogue: 'delorme-art-moderne', lot: 21, maxBidEur: 12000, status: 'accepted' },
  { customer: '0301', catalogue: 'vauclair-photographies', lot: 5, maxBidEur: 700, status: 'won' },
]

/** The website's mock modules, loaded at run time and checked, so the two can't drift apart. */
async function loadWebsiteMocks(): Promise<{ auctions: z.infer<typeof auctionSchema>[]; catalogues: z.infer<typeof catalogueSchema>[] }> {
  const auctionsModule: unknown = await import(new URL('../../../src/mocks/auctions.ts', import.meta.url).href)
  const cataloguesModule: unknown = await import(new URL('../../../src/mocks/catalogues.ts', import.meta.url).href)
  return {
    auctions: z.object({ mockAuctions: z.array(auctionSchema) }).parse(auctionsModule).mockAuctions,
    catalogues: z.object({ mockCatalogues: z.array(catalogueSchema) }).parse(cataloguesModule).mockCatalogues,
  }
}

async function upsertAuction(auction: z.infer<typeof auctionSchema>, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, lot_count, viewing_starts_on,
       viewing_ends_on, description, image_url, image_alt, is_featured)
     VALUES ($1, $2, $3, $4, $5, ($6 || ' ' || $7)::timestamp AT TIME ZONE 'Europe/Paris', $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, category = excluded.category, auction_house = excluded.auction_house,
       city = excluded.city, starts_at = excluded.starts_at, lot_count = excluded.lot_count,
       viewing_starts_on = excluded.viewing_starts_on, viewing_ends_on = excluded.viewing_ends_on,
       description = excluded.description, image_url = excluded.image_url, image_alt = excluded.image_alt,
       is_featured = excluded.is_featured`,
    [
      auction.id,
      auction.title,
      auction.category,
      auction.house,
      auction.city,
      auction.saleDate,
      auction.saleTime,
      auction.lotCount,
      auction.viewing.start,
      auction.viewing.end,
      auction.description,
      auction.image?.src ?? null,
      auction.image?.alt ?? null,
      auction.featured ?? false,
    ],
  )
}

async function upsertCatalogue(catalogue: z.infer<typeof catalogueSchema>, db: Queryable): Promise<void> {
  const { rowCount } = await db.query(
    `INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, page_count, pdf_url,
       cover_image_url, cover_image_alt)
     SELECT $1, a.id, $3, $4, $5, $6, $7, $8, $9, $10 FROM auctions a WHERE a.slug = $2
     ON CONFLICT (slug) DO UPDATE SET
       auction_id = excluded.auction_id, title = excluded.title, description = excluded.description,
       first_lot = excluded.first_lot, last_lot = excluded.last_lot, page_count = excluded.page_count,
       pdf_url = excluded.pdf_url, cover_image_url = excluded.cover_image_url, cover_image_alt = excluded.cover_image_alt`,
    [
      catalogue.id,
      catalogue.auctionId,
      catalogue.title,
      catalogue.description,
      catalogue.lots.first,
      catalogue.lots.last,
      catalogue.pageCount,
      catalogue.pdfUrl,
      catalogue.cover?.src ?? null,
      catalogue.cover?.alt ?? null,
    ],
  )
  if (rowCount !== 1) {
    throw new Error(`Catalogue ${catalogue.id} refers to unknown auction ${catalogue.auctionId}`)
  }
}

/** Sample customers nobody can sign in as: their password is random and immediately forgotten. */
async function upsertSampleCustomer(number: string, db: Queryable): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, country_code, email_verified_at)
     VALUES ($1, $2, 'Sample', $3, 'FR', now())
     ON CONFLICT (email) DO UPDATE SET first_name = excluded.first_name
     RETURNING id`,
    [`sample-collector-${number}@example.com`, await hashPassword(randomBytes(32).toString('base64url')), `Collector ${number}`],
  )
  const id = rows[0]?.id
  if (!id) {
    throw new Error(`Could not create sample customer ${number}`)
  }
  return id
}

async function insertSampleRequest(request: SampleRequest, customerId: string, db: Queryable): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bid_requests (customer_id, auction_id, catalogue_id, lot_number, max_bid_eur, status)
     SELECT $1, c.auction_id, c.id, $3, $4, $5 FROM catalogues c WHERE c.slug = $2
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [customerId, request.catalogue, request.lot, request.maxBidEur, request.status],
  )
  const id = rows[0]?.id
  if (!id) {
    return false
  }
  await db.query(
    "INSERT INTO request_status_history (bid_request_id, from_status, to_status, note) VALUES ($1, NULL, $2, 'Sample data')",
    [id, request.status],
  )
  return true
}

try {
  if (config.env === 'production') {
    throw new Error('db:seed loads sample data and is for development only.')
  }
  const { auctions, catalogues } = await loadWebsiteMocks()

  const counts = await withTransaction(async (client) => {
    for (const auction of auctions) {
      await upsertAuction(auction, client)
    }
    for (const catalogue of catalogues) {
      await upsertCatalogue(catalogue, client)
    }
    const customers = new Map<string, string>()
    let newRequests = 0
    for (const request of sampleRequests) {
      let customerId = customers.get(request.customer)
      if (!customerId) {
        customerId = await upsertSampleCustomer(request.customer, client)
        customers.set(request.customer, customerId)
      }
      if (await insertSampleRequest(request, customerId, client)) {
        newRequests += 1
      }
    }
    return { auctions: auctions.length, catalogues: catalogues.length, sampleCustomers: customers.size, newRequests }
  })
  logger.info('Sample data loaded', counts)
} catch (error) {
  logger.error('Seeding failed; nothing was changed', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
