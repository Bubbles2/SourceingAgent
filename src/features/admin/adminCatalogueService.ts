// Catalogues as administrators manage them (/api/catalogues): those of every sale, never cached.
// After each change the public cache is cleared, so the website shows it at once.
import { ApiError, apiRequest } from '../../services/apiClient'
import { pageOffset, type Page } from '../../services/pagination'
import { clearCachedResponses } from '../../services/responseCache'
import { parseCataloguePage, parseCatalogueWithAuction } from '../auctions/auctionResponses'
import type { SaleStatus } from '../auctions/saleStatus'
import type { Catalogue, CatalogueWithAuction } from '../auctions/types'
import { adminPageSize } from './adminAuctionService'

/** What the catalogue form sends, apart from its id */
export type CatalogueFields = Pick<Catalogue, 'auctionId' | 'title' | 'description' | 'lots' | 'pageCount' | 'pdfUrl' | 'cover'>

function cataloguePath(catalogueId: string): string {
  return `/api/catalogues/${encodeURIComponent(catalogueId)}`
}

function parseResponse(data: unknown): CatalogueWithAuction {
  return parseCatalogueWithAuction(typeof data === 'object' && data !== null && 'catalogue' in data ? data.catalogue : undefined)
}

/** Catalogues of upcoming or completed sales, whatever the sale's status */
export function listAdminCatalogues({ period, page }: { period: SaleStatus; page: number }): Promise<Page<CatalogueWithAuction>> {
  const search = new URLSearchParams({
    status: 'all',
    period,
    limit: String(adminPageSize),
    offset: String(pageOffset(page, adminPageSize)),
  })
  return apiRequest(`/api/catalogues?${search.toString()}`).then(parseCataloguePage)
}

export async function getAdminCatalogue(catalogueId: string): Promise<CatalogueWithAuction | null> {
  try {
    return parseResponse(await apiRequest(cataloguePath(catalogueId)))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

/** Throws ApiError, for the form to show. */
export async function createCatalogue(input: CatalogueFields & { id: string }): Promise<CatalogueWithAuction> {
  const catalogue = parseResponse(await apiRequest('/api/catalogues', { method: 'POST', body: input }))
  clearCachedResponses()
  return catalogue
}

export async function updateCatalogue(catalogueId: string, fields: CatalogueFields): Promise<CatalogueWithAuction> {
  const catalogue = parseResponse(await apiRequest(cataloguePath(catalogueId), { method: 'PATCH', body: fields }))
  clearCachedResponses()
  return catalogue
}

/** Only catalogues no customer has requested lots from can be deleted; the API says so otherwise. */
export async function deleteCatalogue(catalogueId: string): Promise<void> {
  await apiRequest(cataloguePath(catalogueId), { method: 'DELETE' })
  clearCachedResponses()
}
