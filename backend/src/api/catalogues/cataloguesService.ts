// Catalogues: each links to an auction house's PDF and covers a range of the sale's lots. Bid
// requests name a catalogue and a lot, so catalogues of one sale can't share lot numbers, and a
// catalogue keeps every lot customers have already asked for.
// Changes lock the sale's row, so two catalogues can't claim the same lots at the same moment.
import { withTransaction, type Queryable } from '../../db/pool.ts'
import { isUniqueViolation } from '../../lib/databaseErrors.ts'
import { HttpError } from '../../lib/httpError.ts'
import { logger } from '../../lib/logger.ts'
import { findAuctionBySlug, type AuctionRecord } from '../../repositories/auctionsRepository.ts'
import { summariseCatalogueRequests } from '../../repositories/bidRequestsRepository.ts'
import {
  deleteCatalogue,
  findCatalogueBySlug,
  insertCatalogue,
  listCatalogues,
  listCataloguesForAuctions,
  updateCatalogue,
  type CatalogueFields,
} from '../../repositories/cataloguesRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'
import { canSee, listableStatuses } from '../auctions/auctionVisibility.ts'
import { toCatalogueWithAuctionView, type CatalogueWithAuctionView } from './catalogueView.ts'
import type { CreateCatalogueBody, ListCataloguesQuery, UpdateCatalogueBody } from './cataloguesValidation.ts'

export type CataloguePage = {
  catalogues: CatalogueWithAuctionView[]
  total: number
  limit: number
  offset: number
}

const catalogueNotFound = new HttpError(404, 'catalogue_not_found', 'No catalogue was found at this address.')

/** The sale a catalogue names, locked for the rest of the transaction */
async function lockAuction(slug: string, db: Queryable): Promise<AuctionRecord> {
  const auction = await findAuctionBySlug(slug, db, { lock: true })
  if (!auction) {
    throw new HttpError(400, 'validation_failed', 'Some of the information sent is missing or invalid.', [
      { path: 'body.auctionId', message: 'No sale has this id. Choose an existing sale.' },
    ])
  }
  return auction
}

/** The lots must fit within the sale and not overlap its other catalogues. */
async function checkLots(
  lots: CatalogueFields['lots'],
  auction: AuctionRecord,
  catalogueId: string | null,
  db: Queryable,
): Promise<void> {
  if (auction.lotCount !== null && lots.last > auction.lotCount) {
    throw new HttpError(400, 'validation_failed', 'Some of the information sent is missing or invalid.', [
      {
        path: 'body.lots.last',
        message: `This sale has ${auction.lotCount} lots, so the last lot can't be above ${auction.lotCount}.`,
      },
    ])
  }
  const siblings = await listCataloguesForAuctions([auction.id], db)
  const overlapping = siblings.find(
    (sibling) => sibling.id !== catalogueId && lots.first <= sibling.lots.last && lots.last >= sibling.lots.first,
  )
  if (overlapping) {
    throw new HttpError(
      409,
      'lots_overlap',
      `Lots ${overlapping.lots.first}–${overlapping.lots.last} are in the catalogue “${overlapping.title}”. Catalogues of one sale can't share lot numbers.`,
    )
  }
}

function catalogueExists(slug: string): HttpError {
  return new HttpError(409, 'catalogue_exists', `There is already a catalogue with the id ${slug}. Choose another id.`)
}

export async function getCataloguePage(query: ListCataloguesQuery, viewer: UserRecord | undefined): Promise<CataloguePage> {
  const { status, limit, offset, period, auction } = query
  const { catalogues, total } = await listCatalogues(
    { statuses: listableStatuses(status, viewer), period, auctionSlug: auction },
    { limit, offset },
  )
  return { catalogues: catalogues.map(toCatalogueWithAuctionView), total, limit, offset }
}

/** A catalogue is visible exactly when its sale is. */
export async function getCatalogue(slug: string, viewer: UserRecord | undefined): Promise<CatalogueWithAuctionView> {
  const catalogue = await findCatalogueBySlug(slug)
  if (!catalogue || !canSee(catalogue.auction.status, viewer)) {
    throw catalogueNotFound
  }
  return toCatalogueWithAuctionView(catalogue)
}

export async function createCatalogue(
  { id: slug, auctionId, ...fields }: CreateCatalogueBody,
  administrator: UserRecord,
): Promise<CatalogueWithAuctionView> {
  try {
    const catalogue = await withTransaction(async (client) => {
      const auction = await lockAuction(auctionId, client)
      await checkLots(fields.lots, auction, null, client)
      return insertCatalogue(slug, auction.id, fields, client)
    })
    logger.info('Catalogue created', { userId: administrator.id, catalogue: slug, auction: auctionId })
    return toCatalogueWithAuctionView(catalogue)
  } catch (error) {
    if (isUniqueViolation(error, 'catalogues_slug_key')) {
      throw catalogueExists(slug)
    }
    throw error
  }
}

export async function changeCatalogue(
  slug: string,
  { auctionId, ...changes }: UpdateCatalogueBody,
  administrator: UserRecord,
): Promise<CatalogueWithAuctionView> {
  const catalogue = await withTransaction(async (client) => {
    const current = await findCatalogueBySlug(slug, client, { lock: true })
    if (!current) {
      throw catalogueNotFound
    }
    const auction = await lockAuction(auctionId ?? current.auction.slug, client)
    const next: CatalogueFields = {
      title: changes.title ?? current.title,
      description: changes.description ?? current.description,
      lots: changes.lots ?? current.lots,
      pageCount: changes.pageCount === undefined ? current.pageCount : changes.pageCount,
      pdfUrl: changes.pdfUrl ?? current.pdfUrl,
      cover: changes.cover === undefined ? current.cover : changes.cover,
    }

    // Requests name the catalogue together with its sale and lot, so those must keep making sense.
    const requests = await summariseCatalogueRequests(current.id, client)
    if (requests.count > 0 && auction.id !== current.auctionId) {
      throw new HttpError(
        409,
        'catalogue_has_requests',
        'Customers have requested lots from this catalogue, so it must stay with its sale.',
      )
    }
    if (
      requests.firstLot !== null &&
      requests.lastLot !== null &&
      (requests.firstLot < next.lots.first || requests.lastLot > next.lots.last)
    ) {
      throw new HttpError(
        409,
        'requested_lots_outside_range',
        `Customers have requested lots ${requests.firstLot} to ${requests.lastLot} from this catalogue, so its lots must still include them.`,
      )
    }
    await checkLots(next.lots, auction, current.id, client)
    return updateCatalogue(current.id, auction.id, next, client)
  })
  logger.info('Catalogue updated', { userId: administrator.id, catalogue: slug, fields: Object.keys(changes).join(', ') })
  return toCatalogueWithAuctionView(catalogue)
}

/** Deletes a catalogue no customer has requested lots from. */
export async function removeCatalogue(slug: string, administrator: UserRecord): Promise<void> {
  await withTransaction(async (client) => {
    const catalogue = await findCatalogueBySlug(slug, client, { lock: true })
    if (!catalogue) {
      throw catalogueNotFound
    }
    const requests = await summariseCatalogueRequests(catalogue.id, client)
    if (requests.count > 0) {
      throw new HttpError(
        409,
        'catalogue_has_requests',
        'Customers have requested lots from this catalogue, so it cannot be deleted. Cancel the sale instead if it will not go ahead.',
      )
    }
    await deleteCatalogue(catalogue.id, client)
  })
  logger.info('Catalogue deleted', { userId: administrator.id, catalogue: slug })
}
