import { pool, type Queryable } from '../db/pool.ts'
import type { AuctionStatus, SalePeriod } from './auctionsRepository.ts'
import { parisSaleDate, parisSaleTime, saleIsOpen } from './saleTimes.ts'

/** Everything an administrator can set on a catalogue, apart from its sale. */
export type CatalogueFields = {
  title: string
  description: string
  lots: { first: number; last: number }
  pageCount: number | null
  /** External PDF published by the auction house */
  pdfUrl: string
  cover: { src: string; alt: string } | null
}

export type CatalogueRecord = CatalogueFields & {
  id: string
  slug: string
  auctionId: string
  /** The sale the catalogue belongs to */
  auction: {
    slug: string
    title: string
    house: string
    city: string
    saleDate: string
    saleTime: string
    status: AuctionStatus
  }
}

type CatalogueRow = Omit<CatalogueFields, 'lots' | 'cover'> & {
  id: string
  slug: string
  auctionId: string
  firstLot: number
  lastLot: number
  coverUrl: string | null
  coverAlt: string | null
  auctionSlug: string
  auctionTitle: string
  auctionHouse: string
  auctionCity: string
  saleDate: string
  saleTime: string
  auctionStatus: AuctionStatus
}

// Reads catalogues as `c` joined to their auction as `a`.
const catalogueColumns = `c.id, c.slug, c.auction_id AS "auctionId", c.title, c.description, c.first_lot AS "firstLot",
  c.last_lot AS "lastLot", c.page_count AS "pageCount", c.pdf_url AS "pdfUrl", c.cover_image_url AS "coverUrl",
  c.cover_image_alt AS "coverAlt", a.slug AS "auctionSlug", a.title AS "auctionTitle", a.auction_house AS "auctionHouse",
  a.city AS "auctionCity", ${parisSaleDate} AS "saleDate", ${parisSaleTime} AS "saleTime", a.status AS "auctionStatus"`

function toCatalogueRecord(row: CatalogueRow): CatalogueRecord {
  return {
    id: row.id,
    slug: row.slug,
    auctionId: row.auctionId,
    title: row.title,
    description: row.description,
    lots: { first: row.firstLot, last: row.lastLot },
    pageCount: row.pageCount,
    pdfUrl: row.pdfUrl,
    cover: row.coverUrl ? { src: row.coverUrl, alt: row.coverAlt ?? '' } : null,
    auction: {
      slug: row.auctionSlug,
      title: row.auctionTitle,
      house: row.auctionHouse,
      city: row.auctionCity,
      saleDate: row.saleDate,
      saleTime: row.saleTime,
      status: row.auctionStatus,
    },
  }
}

/** Column values in the order the INSERT and UPDATE statements below expect them, from $3 on. */
function fieldValues(fields: CatalogueFields): unknown[] {
  return [
    fields.title,
    fields.description,
    fields.lots.first,
    fields.lots.last,
    fields.pageCount,
    fields.pdfUrl,
    fields.cover?.src ?? null,
    fields.cover?.alt ?? null,
  ]
}

export type CatalogueFilters = {
  /** Statuses of the catalogues' sales */
  statuses: readonly AuctionStatus[]
  period?: SalePeriod
  auctionSlug?: string
}

export async function listCatalogues(
  filters: CatalogueFilters,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ catalogues: CatalogueRecord[]; total: number }> {
  const values: unknown[] = [filters.statuses]
  const conditions = ['a.status = ANY($1::text[])']
  if (filters.period) {
    conditions.push(filters.period === 'upcoming' ? saleIsOpen : `NOT (${saleIsOpen})`)
  }
  if (filters.auctionSlug) {
    values.push(filters.auctionSlug)
    conditions.push(`a.slug = $${values.length}`)
  }
  const where = conditions.join(' AND ')
  const saleOrder = filters.period === 'completed' ? 'a.starts_at DESC' : 'a.starts_at'

  const [page, count] = await Promise.all([
    pool.query<CatalogueRow>(
      `SELECT ${catalogueColumns} FROM catalogues c JOIN auctions a ON a.id = c.auction_id WHERE ${where}
       ORDER BY ${saleOrder}, a.slug, c.first_lot, c.slug
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM catalogues c JOIN auctions a ON a.id = c.auction_id WHERE ${where}`,
      values,
    ),
  ])
  return { catalogues: page.rows.map(toCatalogueRecord), total: count.rows[0]?.total ?? 0 }
}

/** Every catalogue of the given sales (database ids), in lot order */
export async function listCataloguesForAuctions(auctionIds: readonly string[], db: Queryable = pool): Promise<CatalogueRecord[]> {
  if (auctionIds.length === 0) {
    return []
  }
  const { rows } = await db.query<CatalogueRow>(
    `SELECT ${catalogueColumns} FROM catalogues c JOIN auctions a ON a.id = c.auction_id
     WHERE c.auction_id = ANY($1::uuid[]) ORDER BY c.first_lot, c.slug`,
    [auctionIds],
  )
  return rows.map(toCatalogueRecord)
}

/** With `lock`, the catalogue row stays locked until the transaction ends. */
export async function findCatalogueBySlug(
  slug: string,
  db: Queryable = pool,
  { lock = false }: { lock?: boolean } = {},
): Promise<CatalogueRecord | null> {
  const { rows } = await db.query<CatalogueRow>(
    `SELECT ${catalogueColumns} FROM catalogues c JOIN auctions a ON a.id = c.auction_id
     WHERE c.slug = $1${lock ? ' FOR UPDATE OF c' : ''}`,
    [slug],
  )
  const row = rows[0]
  return row ? toCatalogueRecord(row) : null
}

export async function insertCatalogue(
  slug: string,
  auctionId: string,
  fields: CatalogueFields,
  db: Queryable,
): Promise<CatalogueRecord> {
  const { rows } = await db.query<CatalogueRow>(
    `WITH c AS (
       INSERT INTO catalogues (slug, auction_id, title, description, first_lot, last_lot, page_count, pdf_url,
         cover_image_url, cover_image_alt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *
     )
     SELECT ${catalogueColumns} FROM c JOIN auctions a ON a.id = c.auction_id`,
    [slug, auctionId, ...fieldValues(fields)],
  )
  const row = rows[0]
  if (!row) {
    throw new Error('INSERT INTO catalogues returned no row')
  }
  return toCatalogueRecord(row)
}

export async function updateCatalogue(
  id: string,
  auctionId: string,
  fields: CatalogueFields,
  db: Queryable,
): Promise<CatalogueRecord> {
  const { rows } = await db.query<CatalogueRow>(
    `WITH c AS (
       UPDATE catalogues SET auction_id = $2, title = $3, description = $4, first_lot = $5, last_lot = $6,
         page_count = $7, pdf_url = $8, cover_image_url = $9, cover_image_alt = $10
       WHERE id = $1
       RETURNING *
     )
     SELECT ${catalogueColumns} FROM c JOIN auctions a ON a.id = c.auction_id`,
    [id, auctionId, ...fieldValues(fields)],
  )
  const row = rows[0]
  if (!row) {
    throw new Error(`UPDATE catalogues found no row ${id}`)
  }
  return toCatalogueRecord(row)
}

export async function deleteCatalogue(id: string, db: Queryable): Promise<void> {
  await db.query('DELETE FROM catalogues WHERE id = $1', [id])
}
