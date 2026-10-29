// Sales: everyone can browse them and their lots. They come from the auction monitor, so the API only reads them.
import { HttpError } from '../../lib/httpError.ts'
import { isDatabaseId } from '../../lib/validationFields.ts'
import { findAuction, listAuctions } from '../../repositories/auctionsRepository.ts'
import { listLotSummaries } from '../../repositories/lotsRepository.ts'
import { toLotSummaryView, type LotSummaryView } from '../lots/lotView.ts'
import { toAuctionView, type AuctionView } from './auctionView.ts'
import type { ListAuctionsQuery } from './auctionsValidation.ts'

export type AuctionPage = {
  auctions: AuctionView[]
  total: number
  limit: number
  offset: number
}

const auctionNotFound = new HttpError(404, 'auction_not_found', 'No auction was found at this address.')

export async function getAuctionPage({ limit, offset, ...filters }: ListAuctionsQuery): Promise<AuctionPage> {
  const { auctions, total } = await listAuctions(filters, { limit, offset })
  return { auctions: auctions.map(toAuctionView), total, limit, offset }
}

export async function getAuction(id: string): Promise<AuctionView> {
  const auction = isDatabaseId(id) ? await findAuction(id) : null
  if (!auction) {
    throw auctionNotFound
  }
  return toAuctionView(auction)
}

/** Every lot of a sale, in catalogue order, for choosing one to bid on */
export async function getAuctionLots(id: string): Promise<LotSummaryView[]> {
  if (!isDatabaseId(id)) {
    throw auctionNotFound
  }
  const [auction, lots] = await Promise.all([findAuction(id), listLotSummaries(id)])
  if (!auction) {
    throw auctionNotFound
  }
  return lots.map(toLotSummaryView)
}
