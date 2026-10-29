// Lots: everyone can browse them, sale by sale. They come from the auction monitor, so the API only reads them.
import { listLots } from '../../repositories/lotsRepository.ts'
import { toLotWithAuctionView, type LotWithAuctionView } from './lotView.ts'
import type { ListLotsQuery } from './lotsValidation.ts'

export type LotPage = {
  lots: LotWithAuctionView[]
  total: number
  limit: number
  offset: number
}

export async function getLotPage({ auction, period, limit, offset }: ListLotsQuery): Promise<LotPage> {
  const { lots, total } = await listLots({ auctionId: auction, period }, { limit, offset })
  return { lots: lots.map(toLotWithAuctionView), total, limit, offset }
}
