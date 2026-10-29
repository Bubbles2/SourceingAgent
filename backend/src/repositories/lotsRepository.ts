// Lots, as the auction monitor collected them from each sale's catalogue. The website only reads them.
import { pool } from '../db/pool.ts'
import type { SalePeriod } from './auctionsRepository.ts'
import { parisSaleDate, saleIsOpen, saleStartsAt } from './saleTimes.ts'

export type LotRecord = {
  id: string
  auctionId: string
  externalId: string
  lotNumber: string | null
  title: string | null
  description: string | null
  category: string | null
  maker: string | null
  materials: string[] | null
  /** Exact decimal strings, such as "1500.00" */
  estimateLow: string | null
  estimateHigh: string | null
  currency: string | null
  imageUrl: string | null
  sourceUrl: string
  titleUk: string | null
  descriptionUk: string | null
  aiCategory: string | null
  aiSummary: string | null
}

/** A lot with the sale it belongs to */
export type LotWithAuctionRecord = LotRecord & {
  auctionTitle: string
  auctionStartsAt: Date | null
  auctionDate: string | null
  auctionLocation: string | null
}

/** Just enough to choose a lot from a list */
export type LotSummaryRecord = Pick<LotRecord, 'id' | 'lotNumber' | 'title' | 'titleUk'>

/** Catalogue order: lot numbers that start with digits by their number, then the rest as text */
export const lotOrder = `(substring(l.lot_number from '^[0-9]+'))::numeric NULLS LAST, l.lot_number, l.id`

const lotColumns = `l.id, l.auction_id AS "auctionId", l.external_id AS "externalId", l.lot_number AS "lotNumber",
  l.title, l.description, l.category, l.maker, l.materials, l.estimate_low AS "estimateLow",
  l.estimate_high AS "estimateHigh", l.currency, l.image_url AS "imageUrl", l.source_url AS "sourceUrl",
  l.titleuk AS "titleUk", l.descriptionuk AS "descriptionUk", l.ai_category AS "aiCategory", l.ai_summary AS "aiSummary"`

export type LotFilters = {
  /** Only this sale's lots (a database id) */
  auctionId?: string
  period?: SalePeriod
}

/** Lots sale by sale, in catalogue order within each sale. Upcoming sales soonest first; completed most recent first. */
export async function listLots(
  filters: LotFilters,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ lots: LotWithAuctionRecord[]; total: number }> {
  const values: unknown[] = []
  const conditions = ['TRUE']
  if (filters.auctionId) {
    values.push(filters.auctionId)
    conditions.push(`l.auction_id = $${values.length}`)
  }
  if (filters.period) {
    conditions.push(filters.period === 'upcoming' ? saleIsOpen : `NOT (${saleIsOpen})`)
  }
  const where = conditions.join(' AND ')
  const saleOrder = filters.period === 'completed' ? `${saleStartsAt} DESC NULLS LAST` : `${saleStartsAt} NULLS LAST`

  const [page, count] = await Promise.all([
    pool.query<LotWithAuctionRecord>(
      `SELECT ${lotColumns}, a.title AS "auctionTitle", a.starts_at AS "auctionStartsAt", ${parisSaleDate} AS "auctionDate",
         a.location AS "auctionLocation"
       FROM lots l JOIN auctions a ON a.id = l.auction_id
       WHERE ${where}
       ORDER BY ${saleOrder}, a.id, ${lotOrder}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM lots l JOIN auctions a ON a.id = l.auction_id WHERE ${where}`,
      values,
    ),
  ])
  return { lots: page.rows, total: count.rows[0]?.total ?? 0 }
}

/** Every lot of one sale (a database id), in catalogue order */
export async function listLotSummaries(auctionId: string): Promise<LotSummaryRecord[]> {
  const { rows } = await pool.query<LotSummaryRecord>(
    `SELECT l.id, l.lot_number AS "lotNumber", l.title, l.titleuk AS "titleUk"
     FROM lots l WHERE l.auction_id = $1 ORDER BY ${lotOrder}`,
    [auctionId],
  )
  return rows
}
