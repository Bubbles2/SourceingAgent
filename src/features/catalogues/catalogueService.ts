// Catalogues of published sales from the API (/api/catalogues), reused for a minute (responseCache).
import { pageOffset, type Page } from '../../services/pagination'
import { cachedGet } from '../../services/responseCache'
import { parseCataloguePage } from '../auctions/auctionResponses'
import type { SaleStatus } from '../auctions/saleStatus'
import type { CatalogueWithAuction } from '../auctions/types'

export const cataloguesPageSize = 12

/** Catalogues for sales with the given status, in sale order, each with a summary of its sale */
export function listCatalogues({ status, page }: { status: SaleStatus; page: number }): Promise<Page<CatalogueWithAuction>> {
  const search = new URLSearchParams({
    period: status,
    limit: String(cataloguesPageSize),
    offset: String(pageOffset(page, cataloguesPageSize)),
  })
  return cachedGet(`/api/catalogues?${search}`, parseCataloguePage)
}
