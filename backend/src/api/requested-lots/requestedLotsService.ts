import { listReservedLots } from '../../repositories/bidRequestsRepository.ts'

/** A lot with an accepted request, as anyone may see it: no customer, amount or request id. */
export type RequestedLot = {
  auction: { id: string; title: string; house: string; saleDate: string }
  catalogue: { id: string; title: string }
  lotNumber: number
  availability: 'reserved' | 'sale-ended'
}

export async function listRequestedLots(): Promise<RequestedLot[]> {
  const rows = await listReservedLots()
  return rows.map((row) => ({
    auction: { id: row.auctionSlug, title: row.auctionTitle, house: row.auctionHouse, saleDate: row.saleDate },
    catalogue: { id: row.catalogueSlug, title: row.catalogueTitle },
    lotNumber: row.lotNumber,
    availability: row.saleEnded ? 'sale-ended' : 'reserved',
  }))
}
