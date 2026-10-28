// Sales: everyone can browse published ones; administrators create, edit, cancel and delete them.
// Changes run in a transaction with the sale's row locked, so checks against its catalogues can't
// race a catalogue being added at the same moment.
import { pool, withTransaction } from '../../db/pool.ts'
import { isUniqueViolation } from '../../lib/databaseErrors.ts'
import { HttpError, type ErrorDetail } from '../../lib/httpError.ts'
import { logger } from '../../lib/logger.ts'
import { addYears, todayInParis } from '../../lib/parisDate.ts'
import {
  deleteAuction,
  findAuctionBySlug,
  insertAuction,
  listAuctions,
  updateAuction,
  type AuctionFields,
  type AuctionStatus,
} from '../../repositories/auctionsRepository.ts'
import { listCataloguesForAuctions, type CatalogueRecord } from '../../repositories/cataloguesRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'
import { toAuctionView, type AuctionView } from './auctionView.ts'
import { canSee, listableStatuses } from './auctionVisibility.ts'
import type { CreateAuctionBody, ListAuctionsQuery, UpdateAuctionBody } from './auctionsValidation.ts'

export type AuctionPage = {
  auctions: AuctionView[]
  total: number
  limit: number
  offset: number
}

/** How far ahead a sale can be scheduled, which catches mistyped years */
const maxYearsAhead = 5

const auctionNotFound = new HttpError(404, 'auction_not_found', 'No auction was found at this address.')

function invalid(details: readonly ErrorDetail[]): HttpError {
  return new HttpError(400, 'validation_failed', 'Some of the information sent is missing or invalid.', details)
}

/**
 * Sale and viewing dates. A new or moved sale can't be in the past, but a completed sale can still
 * be corrected.
 */
function checkDates(fields: AuctionFields, { saleDateChanged }: { saleDateChanged: boolean }): void {
  const today = todayInParis()
  const details: ErrorDetail[] = []
  if (saleDateChanged && fields.saleDate < today) {
    details.push({ path: 'body.saleDate', message: "The sale date can't be in the past." })
  }
  if (fields.saleDate > addYears(today, maxYearsAhead)) {
    details.push({ path: 'body.saleDate', message: `The sale date must be within the next ${maxYearsAhead} years.` })
  }
  if (fields.viewing && fields.viewing.end > fields.saleDate) {
    details.push({ path: 'body.viewing.end', message: 'Viewing must end on or before the sale date.' })
  }
  if (details.length > 0) {
    throw invalid(details)
  }
}

/** Drafts can be published or cancelled, and a cancelled sale published again; nothing goes back to draft. */
function checkStatusChange(from: AuctionStatus, to: AuctionStatus): void {
  if (to === 'draft' && from !== 'draft') {
    throw new HttpError(
      409,
      'invalid_status_change',
      `This sale is ${from}, so it can't go back to draft. Cancel it instead if it should no longer be shown.`,
    )
  }
}

/** Every catalogue's lots must fit within the sale's lot count, when it is known. */
function checkLotCount(lotCount: number | null, catalogues: readonly CatalogueRecord[]): void {
  const widest = catalogues.reduce<CatalogueRecord | null>(
    (current, catalogue) => (current && current.lots.last >= catalogue.lots.last ? current : catalogue),
    null,
  )
  if (lotCount !== null && widest && widest.lots.last > lotCount) {
    throw new HttpError(
      409,
      'catalogue_lots_exceed_count',
      `The catalogue “${widest.title}” lists lots up to ${widest.lots.last}, so the sale needs at least ${widest.lots.last} lots.`,
    )
  }
}

function groupByAuction(catalogues: readonly CatalogueRecord[]): Map<string, CatalogueRecord[]> {
  const groups = new Map<string, CatalogueRecord[]>()
  for (const catalogue of catalogues) {
    const group = groups.get(catalogue.auctionId)
    if (group) {
      group.push(catalogue)
    } else {
      groups.set(catalogue.auctionId, [catalogue])
    }
  }
  return groups
}

/** One page of sales, each with its catalogues, fetched in two queries whatever the page size. */
export async function getAuctionPage(query: ListAuctionsQuery, viewer: UserRecord | undefined): Promise<AuctionPage> {
  const { status, limit, offset, ...filters } = query
  const { auctions, total } = await listAuctions({ statuses: listableStatuses(status, viewer), ...filters }, { limit, offset })
  const catalogues = groupByAuction(await listCataloguesForAuctions(auctions.map((auction) => auction.id)))
  return {
    auctions: auctions.map((auction) => toAuctionView(auction, catalogues.get(auction.id) ?? [])),
    total,
    limit,
    offset,
  }
}

export async function getAuction(slug: string, viewer: UserRecord | undefined): Promise<AuctionView> {
  const auction = await findAuctionBySlug(slug)
  if (!auction || !canSee(auction.status, viewer)) {
    throw auctionNotFound
  }
  return toAuctionView(auction, await listCataloguesForAuctions([auction.id]))
}

export async function createAuction({ id: slug, ...fields }: CreateAuctionBody, administrator: UserRecord): Promise<AuctionView> {
  checkDates(fields, { saleDateChanged: true })
  try {
    const auction = await insertAuction(slug, fields, pool)
    logger.info('Auction created', { userId: administrator.id, auction: slug, status: auction.status })
    return toAuctionView(auction, [])
  } catch (error) {
    if (isUniqueViolation(error, 'auctions_slug_key')) {
      throw new HttpError(409, 'auction_exists', `There is already a sale with the id ${slug}. Choose another id.`)
    }
    throw error
  }
}

export async function changeAuction(slug: string, changes: UpdateAuctionBody, administrator: UserRecord): Promise<AuctionView> {
  return withTransaction(async (client) => {
    const current = await findAuctionBySlug(slug, client, { lock: true })
    if (!current) {
      throw auctionNotFound
    }
    const { id, slug: _slug, ...currentFields } = current
    const next: AuctionFields = { ...currentFields, ...changes }

    checkStatusChange(current.status, next.status)
    checkDates(next, { saleDateChanged: next.saleDate !== current.saleDate })
    const catalogues = await listCataloguesForAuctions([id], client)
    checkLotCount(next.lotCount, catalogues)

    const updated = await updateAuction(id, next, client)
    logger.info('Auction updated', { userId: administrator.id, auction: slug, fields: Object.keys(changes).join(', ') })
    return toAuctionView(updated, catalogues)
  })
}

/**
 * Deletes a sale that has no catalogues. Once catalogues (and so bid requests) exist, the sale is
 * cancelled instead, which keeps the history customers' requests refer to.
 */
export async function removeAuction(slug: string, administrator: UserRecord): Promise<void> {
  await withTransaction(async (client) => {
    const auction = await findAuctionBySlug(slug, client, { lock: true })
    if (!auction) {
      throw auctionNotFound
    }
    const catalogues = await listCataloguesForAuctions([auction.id], client)
    if (catalogues.length > 0) {
      throw new HttpError(
        409,
        'auction_has_catalogues',
        'This sale still has catalogues. Delete them first, or cancel the sale instead to keep its history.',
      )
    }
    await deleteAuction(auction.id, client)
  })
  logger.info('Auction deleted', { userId: administrator.id, auction: slug })
}
