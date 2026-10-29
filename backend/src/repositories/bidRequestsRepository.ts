import { pool, type Queryable } from '../db/pool.ts'
import { lotOrder } from './lotsRepository.ts'
import { parisSaleDate, saleHasStarted, saleIsOpen, saleStartsAt } from './saleTimes.ts'

export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const
export type BidRequestStatus = (typeof bidRequestStatuses)[number]

/** Once accepted, a request keeps its lot reserved through to the result (matches the unique index). */
export const reservingStatuses: readonly BidRequestStatus[] = ['accepted', 'placed', 'won', 'lost']
/** A customer can't open a second request on a lot while one of these is live (matches the unique index). */
export const openStatuses: readonly BidRequestStatus[] = ['pending', 'accepted', 'placed']

export type RequestTarget = {
  auctionId: string
  saleOpen: boolean
  lot: { id: string; auctionId: string; lotNumber: string | null } | null
}

/**
 * The sale and lot a request names, by their database ids. The lot's row is locked until the
 * transaction ends, so two requests for the same lot are checked one after the other.
 */
export async function findRequestTarget(auctionId: string, lotId: string, db: Queryable): Promise<RequestTarget | null> {
  const auctions = await db.query<{ id: string; saleOpen: boolean }>(
    `SELECT a.id, ${saleIsOpen} AS "saleOpen" FROM auctions a WHERE a.id = $1`,
    [auctionId],
  )
  const auction = auctions.rows[0]
  if (!auction) {
    return null
  }
  const lots = await db.query<{ id: string; auctionId: string; lotNumber: string | null }>(
    'SELECT id, auction_id AS "auctionId", lot_number AS "lotNumber" FROM lots WHERE id = $1 FOR UPDATE',
    [lotId],
  )
  return { auctionId: auction.id, saleOpen: auction.saleOpen, lot: lots.rows[0] ?? null }
}

/** The customer's open request on a lot, if any */
export async function findOpenRequestStatus(customerId: string, lotId: string, db: Queryable): Promise<BidRequestStatus | null> {
  const { rows } = await db.query<{ status: BidRequestStatus }>(
    'SELECT status FROM bid_requests WHERE customer_id = $1 AND lot_id = $2 AND status = ANY($3::text[]) LIMIT 1',
    [customerId, lotId, openStatuses],
  )
  return rows[0]?.status ?? null
}

export async function isLotReserved(lotId: string, db: Queryable): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM bid_requests WHERE lot_id = $1 AND status = ANY($2::text[]) LIMIT 1', [
    lotId,
    reservingStatuses,
  ])
  return rows.length > 0
}

export async function insertBidRequest(
  request: {
    customerId: string
    auctionId: string
    lotId: string
    maxBidEur: number
    instructions: string
  },
  db: Queryable,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bid_requests (customer_id, auction_id, lot_id, max_bid_eur, instructions)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [request.customerId, request.auctionId, request.lotId, request.maxBidEur, request.instructions],
  )
  const id = rows[0]?.id
  if (!id) {
    throw new Error('INSERT INTO bid_requests returned no row')
  }
  return id
}

/** The sale and lot a request names, as the requests below show them */
export type RequestSaleAndLotRow = {
  auctionId: string
  auctionTitle: string
  auctionStartsAt: Date | null
  auctionDate: string | null
  auctionLocation: string | null
  lotId: string
  lotNumber: string | null
  lotTitle: string | null
  lotTitleUk: string | null
}

const saleAndLotColumns = `a.id AS "auctionId", a.title AS "auctionTitle", a.starts_at AS "auctionStartsAt",
  ${parisSaleDate} AS "auctionDate", a.location AS "auctionLocation",
  l.id AS "lotId", l.lot_number AS "lotNumber", l.title AS "lotTitle", l.titleuk AS "lotTitleUk"`

/** A customer's own request with its sale and lot. Amounts arrive as exact decimal strings. */
export type CustomerBidRequestRow = RequestSaleAndLotRow & {
  id: string
  maxBidEur: string
  instructions: string
  status: BidRequestStatus
  submittedAt: Date
}

const customerRequestQuery = `
  SELECT br.id, br.max_bid_eur AS "maxBidEur", br.instructions, br.status, br.submitted_at AS "submittedAt",
    ${saleAndLotColumns}
  FROM bid_requests br
  JOIN auctions a ON a.id = br.auction_id
  JOIN lots l ON l.id = br.lot_id`

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

/** The public view of reserved lots. Selects no customer, amount or request id. */
export type ReservedLotRow = RequestSaleAndLotRow & {
  saleEnded: boolean
}

export async function listReservedLots(): Promise<ReservedLotRow[]> {
  const { rows } = await pool.query<ReservedLotRow>(
    `SELECT ${saleAndLotColumns}, NOT ${saleIsOpen} AS "saleEnded"
     FROM bid_requests br
     JOIN auctions a ON a.id = br.auction_id
     JOIN lots l ON l.id = br.lot_id
     WHERE br.status = ANY($1::text[])
     ORDER BY "saleEnded", ${saleStartsAt} NULLS LAST, a.id, ${lotOrder}`,
    [reservingStatuses],
  )
  return rows
}

/** Requests that have been decided and won't change again */
export const closedStatuses: readonly BidRequestStatus[] = ['rejected', 'cancelled', 'won', 'lost']

/** A request as the agent reviews it: with the customer, the amount and the state of its sale and lot */
export type ReviewBidRequestRow = CustomerBidRequestRow & {
  updatedAt: Date
  customerId: string
  customerFirstName: string
  customerLastName: string
  customerEmail: string
  customerCompany: string | null
  customerCountry: string
  /** The sale day hasn't ended (Paris time), so requests can still be accepted */
  saleOpen: boolean
  /** The sale has begun, so a result can be recorded */
  saleStarted: boolean
  /** Another request already reserves this lot */
  lotHeldByOther: boolean
}

const reviewRequestQuery = `
  SELECT br.id, br.max_bid_eur AS "maxBidEur", br.instructions, br.status,
    br.submitted_at AS "submittedAt", br.updated_at AS "updatedAt",
    ${saleAndLotColumns},
    ${saleIsOpen} AS "saleOpen", ${saleHasStarted} AS "saleStarted",
    u.id AS "customerId", u.first_name AS "customerFirstName", u.last_name AS "customerLastName",
    u.email AS "customerEmail", u.company_name AS "customerCompany", u.country_code AS "customerCountry",
    EXISTS (
      SELECT 1 FROM bid_requests other
      WHERE other.lot_id = br.lot_id AND other.id <> br.id AND other.status = ANY($1::text[])
    ) AS "lotHeldByOther"
  FROM bid_requests br
  JOIN auctions a ON a.id = br.auction_id
  JOIN lots l ON l.id = br.lot_id
  JOIN users u ON u.id = br.customer_id`

export type ReviewFilters = {
  statuses: readonly BidRequestStatus[]
  /** Only requests for this sale (a database id) */
  auctionId?: string
  /** Only customers whose name, email address or company contains this text */
  customer?: string
}

/** Escapes LIKE wildcards so customer searches match the text as typed */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

/**
 * Requests matching the filters. Open work comes in sale order, soonest sale first, so the most
 * urgent requests lead; anything including closed requests comes most recently changed first.
 */
export async function listReviewBidRequests(
  filters: ReviewFilters,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ requests: ReviewBidRequestRow[]; total: number }> {
  // $1 is used by the query's "lot held by another request" check; filters follow from $2.
  const values: unknown[] = [reservingStatuses, filters.statuses]
  const conditions = ['br.status = ANY($2::text[])']
  if (filters.auctionId) {
    values.push(filters.auctionId)
    conditions.push(`br.auction_id = $${values.length}`)
  }
  if (filters.customer) {
    values.push(containsPattern(filters.customer))
    const pattern = `$${values.length}`
    conditions.push(
      `(u.first_name || ' ' || u.last_name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.company_name ILIKE ${pattern})`,
    )
  }
  const where = conditions.join(' AND ')
  const onlyOpen = filters.statuses.every((status) => !closedStatuses.includes(status))
  const order = onlyOpen
    ? `${saleStartsAt} NULLS LAST, a.id, ${lotOrder}, br.submitted_at, br.id`
    : 'br.updated_at DESC, br.id'

  const [page, count] = await Promise.all([
    pool.query<ReviewBidRequestRow>(
      `${reviewRequestQuery} WHERE ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    // The same filters; $1 stays in the list (unused here) so the placeholders keep their numbers.
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM bid_requests br
       JOIN users u ON u.id = br.customer_id
       WHERE $1::text[] IS NOT NULL AND ${where}`,
      values,
    ),
  ])
  return { requests: page.rows, total: count.rows[0]?.total ?? 0 }
}

export async function findReviewBidRequest(id: string, db: Queryable = pool): Promise<ReviewBidRequestRow | null> {
  const { rows } = await db.query<ReviewBidRequestRow>(`${reviewRequestQuery} WHERE br.id = $2`, [reservingStatuses, id])
  return rows[0] ?? null
}

/** Locks a request until the transaction ends, so two decisions about it are made one after the other. */
export async function lockBidRequest(id: string, db: Queryable): Promise<{ id: string; status: BidRequestStatus; lotId: string } | null> {
  const { rows } = await db.query<{ id: string; status: BidRequestStatus; lotId: string }>(
    'SELECT id, status, lot_id AS "lotId" FROM bid_requests WHERE id = $1 FOR UPDATE',
    [id],
  )
  return rows[0] ?? null
}

export async function setBidRequestStatus(id: string, status: BidRequestStatus, db: Queryable): Promise<void> {
  await db.query('UPDATE bid_requests SET status = $2 WHERE id = $1', [id, status])
}
