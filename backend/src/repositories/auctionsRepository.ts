// Sales, as the auction monitor collected them. The website only reads them.
import { pool } from '../db/pool.ts'
import { parisMidnight, parisSaleDate, saleIsOpen, saleStartsAt } from './saleTimes.ts'

export type SalePeriod = 'upcoming' | 'completed'

export type AuctionRecord = {
  id: string
  externalId: string
  title: string
  startsAt: Date | null
  endsAt: Date | null
  /** The sale day in Paris, YYYY-MM-DD */
  auctionDate: string | null
  location: string | null
  catalogueUrl: string | null
  sourceUrl: string
  status: string | null
  lotCount: number
}

// bigint keys arrive from pg as strings. The sale day is formatted in SQL, so it never depends on
// the server's time zone.
const auctionColumns = `a.id, a.external_id AS "externalId", a.title, a.starts_at AS "startsAt", a.ends_at AS "endsAt",
  ${parisSaleDate} AS "auctionDate", a.location, a.catalogue_url AS "catalogueUrl", a.source_url AS "sourceUrl", a.status,
  (SELECT count(*)::int FROM lots l WHERE l.auction_id = a.id) AS "lotCount"`

export type AuctionFilters = {
  period?: SalePeriod
  /** First and last Paris dates to include (YYYY-MM-DD) */
  from?: string
  to?: string
}

/** WHERE conditions for the filters; their values are appended to `values` as parameters. */
function filterConditions(filters: AuctionFilters, values: unknown[]): string {
  const parameter = (value: unknown): string => {
    values.push(value)
    return `$${values.length}`
  }
  const conditions = ['TRUE']
  if (filters.period) {
    conditions.push(filters.period === 'upcoming' ? saleIsOpen : `NOT (${saleIsOpen})`)
  }
  if (filters.from) {
    conditions.push(`${saleStartsAt} >= ${parisMidnight(`${parameter(filters.from)}::date`)}`)
  }
  if (filters.to) {
    conditions.push(`${saleStartsAt} < ${parisMidnight(`${parameter(filters.to)}::date + 1`)}`)
  }
  return conditions.join(' AND ')
}

/** Upcoming sales soonest first; completed sales most recent first. */
function saleOrder(period: SalePeriod | undefined): string {
  return period === 'completed' ? `${saleStartsAt} DESC NULLS LAST, a.id` : `${saleStartsAt} NULLS LAST, a.id`
}

export async function listAuctions(
  filters: AuctionFilters,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ auctions: AuctionRecord[]; total: number }> {
  const values: unknown[] = []
  const where = filterConditions(filters, values)
  const [page, count] = await Promise.all([
    pool.query<AuctionRecord>(
      `SELECT ${auctionColumns} FROM auctions a WHERE ${where} ORDER BY ${saleOrder(filters.period)}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM auctions a WHERE ${where}`, values),
  ])
  return { auctions: page.rows, total: count.rows[0]?.total ?? 0 }
}

/** `id` must be a database id (see isDatabaseId). */
export async function findAuction(id: string): Promise<AuctionRecord | null> {
  const { rows } = await pool.query<AuctionRecord>(`SELECT ${auctionColumns} FROM auctions a WHERE a.id = $1`, [id])
  return rows[0] ?? null
}
