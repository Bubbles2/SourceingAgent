// npm run db:seed — development only. Loads sample auctions and catalogues (sampleSales.ts) into
// PostgreSQL as published sales, plus a few accepted requests from sample customers so Requested
// lots and the "lot already reserved" rule have data.
// Safe to run again: rows are matched by slug or email and updated in place.
import { randomBytes } from 'node:crypto'
import { config } from '../config/env.ts'
import { closePool, withTransaction, type Queryable } from '../db/pool.ts'
import { describeError } from '../lib/describeError.ts'
import { logger } from '../lib/logger.ts'
import { hashPassword } from '../security/password.ts'
import { sampleAuctions, sampleCatalogues, type SampleAuction, type SampleCatalogue } from './sampleSales.ts'

type SampleRequest = {
  customer: string
  catalogue: string
  lot: number
  maxBidEur: number
  status: 'pending' | 'accepted' | 'won'
}

// Other customers' requests, so some lots are reserved
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

async function upsertAuction(auction: SampleAuction, db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO auctions (slug, title, category, auction_house, city, starts_at, lot_count, viewing_starts_on,
       viewing_ends_on, description, is_featured, status)
     VALUES ($1, $2, $3, $4, $5, ($6::date + $7::time) AT TIME ZONE 'Europe/Paris', $8, $9, $10, $11, $12, 'published')
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title, category = excluded.category, auction_house = excluded.auction_house,
       city = excluded.city, starts_at = excluded.starts_at, lot_count = excluded.lot_count,
       viewing_starts_on = excluded.viewing_starts_on, viewing_ends_on = excluded.viewing_ends_on,
       description = excluded.description, is_featured = excluded.is_featured, status = excluded.status`,
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
      auction.featured ?? false,
    ],
  )
}

async function upsertCatalogue(catalogue: SampleCatalogue, db: Queryable): Promise<void> {
  const { rowCount } = await db.query(
    `INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, page_count, pdf_url)
     SELECT $1, a.id, $3, $4, $5, $6, $7, $8 FROM auctions a WHERE a.slug = $2
     ON CONFLICT (slug) DO UPDATE SET
       auction_id = excluded.auction_id, title = excluded.title, description = excluded.description,
       first_lot = excluded.first_lot, last_lot = excluded.last_lot, page_count = excluded.page_count,
       pdf_url = excluded.pdf_url`,
    [
      catalogue.id,
      catalogue.auctionId,
      catalogue.title,
      catalogue.description,
      catalogue.lots.first,
      catalogue.lots.last,
      catalogue.pageCount,
      catalogue.pdfUrl,
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
  const counts = await withTransaction(async (client) => {
    for (const auction of sampleAuctions) {
      await upsertAuction(auction, client)
    }
    for (const catalogue of sampleCatalogues) {
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
    return { auctions: sampleAuctions.length, catalogues: sampleCatalogues.length, sampleCustomers: customers.size, newRequests }
  })
  logger.info('Sample data loaded', counts)
} catch (error) {
  logger.error('Seeding failed; nothing was changed', describeError(error))
  process.exitCode = 1
} finally {
  await closePool()
}
