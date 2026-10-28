import { pool, type Queryable } from '../db/pool.ts'
import { parisSaleDate, parisSaleTime, saleIsOpen } from './saleTimes.ts'

export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const
export type BidRequestStatus = (typeof bidRequestStatuses)[number]

/** Once accepted, a request keeps its lot reserved through to the result (matches the unique index). */
export const reservingStatuses: readonly BidRequestStatus[] = ['accepted', 'placed', 'won', 'lost']
/** A customer can't open a second request on a lot while one of these is live (matches the unique index). */
export const openStatuses: readonly BidRequestStatus[] = ['pending', 'accepted', 'placed']

export type RequestTarget = {
  auctionId: string
  saleOpen: boolean
  catalogue: {
    id: string
    auctionId: string
    firstLot: number
    lastLot: number
  } | null
}

/**
 * The published sale and catalogue a request names, by their public slugs. The catalogue row is
 * locked until the transaction ends, so two requests for the same catalogue are checked one after
 * the other. Draft and cancelled sales take no requests.
 */
export async function findRequestTarget(auctionSlug: string, catalogueSlug: string, db: Queryable): Promise<RequestTarget | null> {
  const auctions = await db.query<{ id: string; saleOpen: boolean }>(
    `SELECT a.id, ${saleIsOpen} AS "saleOpen" FROM auctions a WHERE a.slug = $1 AND a.status = 'published'`,
    [auctionSlug],
  )
  const auction = auctions.rows[0]
  if (!auction) {
    return null
  }
  const catalogues = await db.query<{ id: string; auctionId: string; firstLot: number; lastLot: number }>(
    `SELECT id, auction_id AS "auctionId", first_lot AS "firstLot", last_lot AS "lastLot"
     FROM catalogues WHERE slug = $1 FOR UPDATE`,
    [catalogueSlug],
  )
  return { auctionId: auction.id, saleOpen: auction.saleOpen, catalogue: catalogues.rows[0] ?? null }
}

/** The customer's open request on a lot, if any */
export async function findOpenRequestStatus(
  customerId: string,
  catalogueId: string,
  lotNumber: number,
  db: Queryable,
): Promise<BidRequestStatus | null> {
  const { rows } = await db.query<{ status: BidRequestStatus }>(
    `SELECT status FROM bid_requests
     WHERE customer_id = $1 AND catalogue_id = $2 AND lot_number = $3 AND status = ANY($4::text[])
     LIMIT 1`,
    [customerId, catalogueId, lotNumber, openStatuses],
  )
  return rows[0]?.status ?? null
}

export async function isLotReserved(catalogueId: string, lotNumber: number, db: Queryable): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM bid_requests WHERE catalogue_id = $1 AND lot_number = $2 AND status = ANY($3::text[]) LIMIT 1',
    [catalogueId, lotNumber, reservingStatuses],
  )
  return rows.length > 0
}

export async function insertBidRequest(
  request: {
    customerId: string
    auctionId: string
    catalogueId: string
    lotNumber: number
    maxBidEur: number
    instructions: string
  },
  db: Queryable,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bid_requests (customer_id, auction_id, catalogue_id, lot_number, max_bid_eur, instructions)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [request.customerId, request.auctionId, request.catalogueId, request.lotNumber, request.maxBidEur, request.instructions],
  )
  const id = rows[0]?.id
  if (!id) {
    throw new Error('INSERT INTO bid_requests returned no row')
  }
  return id
}

/** A customer's own request with its sale and catalogue. Amounts arrive as exact decimal strings. */
export type CustomerBidRequestRow = {
  id: string
  lotNumber: number
  maxBidEur: string
  instructions: string
  status: BidRequestStatus
  submittedAt: Date
  auctionSlug: string
  auctionTitle: string
  auctionHouse: string
  auctionCity: string
  saleDate: string
  saleTime: string
  catalogueSlug: string
  catalogueTitle: string
}

const customerRequestQuery = `
  SELECT br.id, br.lot_number AS "lotNumber", br.max_bid_eur AS "maxBidEur", br.instructions, br.status,
    br.submitted_at AS "submittedAt",
    a.slug AS "auctionSlug", a.title AS "auctionTitle", a.auction_house AS "auctionHouse", a.city AS "auctionCity",
    ${parisSaleDate} AS "saleDate", ${parisSaleTime} AS "saleTime",
    c.slug AS "catalogueSlug", c.title AS "catalogueTitle"
  FROM bid_requests br
  JOIN auctions a ON a.id = br.auction_id
  JOIN catalogues c ON c.id = br.catalogue_id`

/** Only ever the given customer's requests, newest first */
export async function listCustomerBidRequests(customerId: string): Promise<CustomerBidRequestRow[]> {
  const { rows } = await pool.query<CustomerBidRequestRow>(
    `${customerRequestQuery} WHERE br.customer_id = $1 ORDER BY br.submitted_at DESC, br.id`,
    [customerId],
  )
  return rows
}

export async function findCustomerBidRequest(
  id: string,
  customerId: string,
  db: Queryable = pool,
): Promise<CustomerBidRequestRow | null> {
  const { rows } = await db.query<CustomerBidRequestRow>(`${customerRequestQuery} WHERE br.id = $1 AND br.customer_id = $2`, [
    id,
    customerId,
  ])
  return rows[0] ?? null
}

/** The public view of reserved lots in published sales. Selects no customer, amount or request id. */
export type ReservedLotRow = {
  auctionSlug: string
  auctionTitle: string
  auctionHouse: string
  saleDate: string
  catalogueSlug: string
  catalogueTitle: string
  lotNumber: number
  saleEnded: boolean
}

export async function listReservedLots(): Promise<ReservedLotRow[]> {
  const { rows } = await pool.query<ReservedLotRow>(
    `SELECT a.slug AS "auctionSlug", a.title AS "auctionTitle", a.auction_house AS "auctionHouse",
       ${parisSaleDate} AS "saleDate", c.slug AS "catalogueSlug", c.title AS "catalogueTitle",
       br.lot_number AS "lotNumber", NOT (${saleIsOpen}) AS "saleEnded"
     FROM bid_requests br
     JOIN auctions a ON a.id = br.auction_id
     JOIN catalogues c ON c.id = br.catalogue_id
     WHERE br.status = ANY($1::text[]) AND a.status = 'published'
     ORDER BY "saleEnded", a.starts_at, c.title, br.lot_number`,
    [reservingStatuses],
  )
  return rows
}

/** How many requests name a catalogue, and the lowest and highest lot they ask for */
export async function summariseCatalogueRequests(
  catalogueId: string,
  db: Queryable,
): Promise<{ count: number; firstLot: number | null; lastLot: number | null }> {
  const { rows } = await db.query<{ count: number; firstLot: number | null; lastLot: number | null }>(
    `SELECT count(*)::int AS count, min(lot_number) AS "firstLot", max(lot_number) AS "lastLot"
     FROM bid_requests WHERE catalogue_id = $1`,
    [catalogueId],
  )
  return rows[0] ?? { count: 0, firstLot: null, lastLot: null }
}
