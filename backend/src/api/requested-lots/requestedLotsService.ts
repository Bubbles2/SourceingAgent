import { listReservedLots } from '../../repositories/bidRequestsRepository.ts'
import { toRequestSaleAndLot, type RequestSaleAndLot } from '../bid-requests/requestSaleAndLot.ts'

/** A lot with an accepted request, as anyone may see it: no customer, amount or request id. */
export type RequestedLot = RequestSaleAndLot & {
  availability: 'reserved' | 'sale-ended'
}

export async function listRequestedLots(): Promise<RequestedLot[]> {
  const rows = await listReservedLots()
  return rows.map((row) => ({
    ...toRequestSaleAndLot(row),
    availability: row.saleEnded ? 'sale-ended' : 'reserved',
  }))
}
