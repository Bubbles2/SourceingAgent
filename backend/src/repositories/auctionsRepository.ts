import { pool, type Queryable } from '../db/pool.ts'
import { parisMidnight, parisSaleDate, parisSaleTime, saleIsOpen } from './saleTimes.ts'

export const auctionStatuses = ['draft', 'published', 'cancelled'] as const
export type AuctionStatus = (typeof auctionStatuses)[number]

export type SalePeriod = 'upcoming' | 'completed'

/** Everything an administrator can set on a sale. Dates and times are in Paris time. */
export type AuctionFields = {
  title: string
  category: string
  house: string
  city: string
  /** YYYY-MM-DD */
  saleDate: string
  /** HH:mm */
  saleTime: string
  lotCount: number | null
  viewing: { start: string; end: string } | null
  description: string
  image: { src: string; alt: string } | null
  featured: boolean
  status: AuctionStatus
}

export type AuctionRecord = AuctionFields & {
  id: string
  slug: string
}

type AuctionRow = Omit<AuctionFields, 'viewing' | 'image'> & {
  id: string
  slug: string
  viewingStart: string | null
  viewingEnd: string | null
  imageUrl: string | null
  imageAlt: string | null
}

// Dates are formatted in SQL, so pg never turns them into JavaScript Dates in the server's time zone.
const auctionColumns = `a.id, a.slug, a.title, a.category, a.auction_house AS "house", a.city,
  ${parisSaleDate} AS "saleDate", ${parisSaleTime} AS "saleTime", a.lot_count AS "lotCount",
  to_char(a.viewing_starts_on, 'YYYY-MM-DD') AS "viewingStart", to_char(a.viewing_ends_on, 'YYYY-MM-DD') AS "viewingEnd",
  a.description, a.image_url AS "imageUrl", a.image_alt AS "imageAlt", a.is_featured AS "featured", a.status`

function toAuctionRecord({ viewingStart, viewingEnd, imageUrl, imageAlt, ...row }: AuctionRow): AuctionRecord {
  return {
    ...row,
    viewing: viewingStart && viewingEnd ? { start: viewingStart, end: viewingEnd } : null,
    image: imageUrl ? { src: imageUrl, alt: imageAlt ?? '' } : null,
  }
}

/** Column values in the order the INSERT and UPDATE statements below expect them, from $2 on. */
function fieldValues(fields: AuctionFields): unknown[] {
  return [
    fields.title,
    fields.category,
    fields.house,
    fields.city,
    fields.saleDate,
    fields.saleTime,
    fields.lotCount,
    fields.viewing?.start ?? null,
    fields.viewing?.end ?? null,
    fields.description,
    fields.image?.src ?? null,
    fields.image?.alt ?? null,
    fields.featured,
    fields.status,
  ]
}

// The sale's start is entered in Paris time, so daylight saving is handled by PostgreSQL.
const startsAt = "($6::date + $7::time) AT TIME ZONE 'Europe/Paris'"

export type AuctionFilters = {
  statuses: readonly AuctionStatus[]
  period?: SalePeriod
  /** First and last Paris dates to include (YYYY-MM-DD) */
  from?: string
  to?: string
  featured?: boolean
}

/** WHERE conditions for the filters; their values are appended to `values` as parameters. */
function filterConditions(filters: AuctionFilters, values: unknown[]): string {
  const parameter = (value: unknown): string => {
    values.push(value)
    return `$${values.length}`
  }
  const conditions = [`a.status = ANY(${parameter(filters.statuses)}::text[])`]
  if (filters.period) {
    conditions.push(filters.period === 'upcoming' ? saleIsOpen : `NOT (${saleIsOpen})`)
  }
  if (filters.from) {
    conditions.push(`a.starts_at >= ${parisMidnight(`${parameter(filters.from)}::date`)}`)
  }
  if (filters.to) {
    conditions.push(`a.starts_at < ${parisMidnight(`${parameter(filters.to)}::date + 1`)}`)
  }
  if (filters.featured !== undefined) {
    conditions.push(`a.is_featured = ${parameter(filters.featured)}`)
  }
  return conditions.join(' AND ')
}

/** Upcoming sales soonest first; completed sales most recent first. */
function saleOrder(period: SalePeriod | undefined): string {
  return period === 'completed' ? 'a.starts_at DESC, a.slug' : 'a.starts_at, a.slug'
}

export async function listAuctions(
  filters: AuctionFilters,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ auctions: AuctionRecord[]; total: number }> {
  const values: unknown[] = []
  const where = filterConditions(filters, values)
  const [page, count] = await Promise.all([
    pool.query<AuctionRow>(
      `SELECT ${auctionColumns} FROM auctions a WHERE ${where} ORDER BY ${saleOrder(filters.period)}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM auctions a WHERE ${where}`, values),
  ])
  return { auctions: page.rows.map(toAuctionRecord), total: count.rows[0]?.total ?? 0 }
}

/** With `lock`, the row stays locked until the transaction ends, so checks and the change that follows can't interleave. */
export async function findAuctionBySlug(
  slug: string,
  db: Queryable = pool,
  { lock = false }: { lock?: boolean } = {},
): Promise<AuctionRecord | null> {
  const { rows } = await db.query<AuctionRow>(
    `SELECT ${auctionColumns} FROM auctions a WHERE a.slug = $1${lock ? ' FOR UPDATE' : ''}`,
    [slug],
  )
  const row = rows[0]
  return row ? toAuctionRecord(row) : null
}

export async function insertAuction(slug: string, fields: AuctionFields, db: Queryable): Promise<AuctionRecord> {
  const { rows } = await db.query<AuctionRow>(
    `INSERT INTO auctions AS a (slug, title, category, auction_house, city, starts_at, lot_count, viewing_starts_on,
       viewing_ends_on, description, image_url, image_alt, is_featured, status)
     VALUES ($1, $2, $3, $4, $5, ${startsAt}, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING ${auctionColumns}`,
    [slug, ...fieldValues(fields)],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('INSERT INTO auctions returned no row')
  }
  return toAuctionRecord(row)
}

export async function updateAuction(id: string, fields: AuctionFields, db: Queryable): Promise<AuctionRecord> {
  const { rows } = await db.query<AuctionRow>(
    `UPDATE auctions a SET title = $2, category = $3, auction_house = $4, city = $5, starts_at = ${startsAt},
       lot_count = $8, viewing_starts_on = $9, viewing_ends_on = $10, description = $11, image_url = $12,
       image_alt = $13, is_featured = $14, status = $15
     WHERE a.id = $1
     RETURNING ${auctionColumns}`,
    [id, ...fieldValues(fields)],
  )
  const row = rows[0]
  if (!row) {
    throw new Error(`UPDATE auctions found no row ${id}`)
  }
  return toAuctionRecord(row)
}

export async function deleteAuction(id: string, db: Queryable): Promise<void> {
  await db.query('DELETE FROM auctions WHERE id = $1', [id])
}
