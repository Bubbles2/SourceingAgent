// Mock-backed data access for catalogues. Swap these bodies for API calls in Phase 3; callers keep the same contracts.
import { mockAuctions } from '../../mocks/auctions'
import { mockCatalogues } from '../../mocks/catalogues'
import { mockResponse } from '../../services/mockApi'
import { compareBySaleDate } from '../auctions/auctionService'
import { getSaleStatus, type SaleStatus } from '../auctions/saleStatus'
import type { AuctionSummary, CatalogueWithAuction } from '../auctions/types'

const auctionSummaries = new Map<string, AuctionSummary>(
  mockAuctions.map(({ id, title, house, city, saleDate, saleTime }) => [
    id,
    { id, title, house, city, saleDate, saleTime },
  ]),
)

/** Catalogues for sales with the given status, each with a summary of its auction. */
export function listCatalogues({ status }: { status: SaleStatus }): Promise<CatalogueWithAuction[]> {
  const catalogues = mockCatalogues
    .flatMap((catalogue) => {
      const auction = auctionSummaries.get(catalogue.auctionId)
      return auction ? [{ ...catalogue, auction }] : []
    })
    .filter((catalogue) => getSaleStatus(catalogue.auction.saleDate) === status)
    .sort((a, b) => compareBySaleDate(status)(a.auction, b.auction) || a.lots.first - b.lots.first)
  return mockResponse(catalogues)
}
