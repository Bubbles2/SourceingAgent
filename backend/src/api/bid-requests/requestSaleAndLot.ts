// The sale and lot a bid request names, as customers, administrators and the public see them.
import type { RequestSaleAndLotRow } from '../../repositories/bidRequestsRepository.ts'
import { toAuctionSummaryView, type AuctionSummaryView } from '../auctions/auctionView.ts'
import { toLotSummaryView, type LotSummaryView } from '../lots/lotView.ts'

export type RequestSaleAndLot = {
  auction: AuctionSummaryView
  lot: LotSummaryView
}

export function toRequestSaleAndLot(row: RequestSaleAndLotRow): RequestSaleAndLot {
  return {
    auction: toAuctionSummaryView({
      id: row.auctionId,
      title: row.auctionTitle,
      startsAt: row.auctionStartsAt,
      auctionDate: row.auctionDate,
      location: row.auctionLocation,
    }),
    lot: toLotSummaryView({ id: row.lotId, lotNumber: row.lotNumber, title: row.lotTitle, titleUk: row.lotTitleUk }),
  }
}

/** "lot 302", or "this lot" when the catalogue gave it no number */
export function lotName(lotNumber: string | null): string {
  return lotNumber ? `lot ${lotNumber}` : 'this lot'
}
