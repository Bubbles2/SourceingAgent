// Mock-backed data access for auctions. Swap these bodies for API calls in Phase 3; callers keep the same contracts.
import { mockAuctions } from '../../mocks/auctions'
import { mockCatalogues } from '../../mocks/catalogues'
import { mockResponse } from '../../services/mockApi'
import { getSaleStatus, type SaleStatus } from './saleStatus'
import type { Auction, AuctionWithCatalogues } from './types'

function withCatalogues(auction: Auction): AuctionWithCatalogues {
  return { ...auction, catalogues: mockCatalogues.filter((catalogue) => catalogue.auctionId === auction.id) }
}

/** Upcoming sales soonest first; completed sales most recent first. */
export function compareBySaleDate(status: SaleStatus) {
  return (a: Pick<Auction, 'saleDate' | 'saleTime'>, b: Pick<Auction, 'saleDate' | 'saleTime'>): number => {
    const order = `${a.saleDate}T${a.saleTime}`.localeCompare(`${b.saleDate}T${b.saleTime}`)
    return status === 'upcoming' ? order : -order
  }
}

export function listAuctions({ status }: { status: SaleStatus }): Promise<AuctionWithCatalogues[]> {
  const auctions = mockAuctions
    .filter((auction) => getSaleStatus(auction.saleDate) === status)
    .sort(compareBySaleDate(status))
    .map(withCatalogues)
  return mockResponse(auctions)
}

export function listFeaturedAuctions(): Promise<AuctionWithCatalogues[]> {
  const auctions = mockAuctions
    .filter((auction) => auction.featured && getSaleStatus(auction.saleDate) === 'upcoming')
    .sort(compareBySaleDate('upcoming'))
    .map(withCatalogues)
  return mockResponse(auctions)
}

export function getAuction(auctionId: string): Promise<AuctionWithCatalogues | null> {
  const auction = mockAuctions.find((candidate) => candidate.id === auctionId)
  return mockResponse(auction ? withCatalogues(auction) : null)
}
