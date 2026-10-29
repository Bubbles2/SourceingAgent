import type { Request, Response } from 'express'
import type { LotSummaryView } from '../lots/lotView.ts'
import { getAuction, getAuctionLots, getAuctionPage, type AuctionPage } from './auctionsService.ts'
import type { AuctionView } from './auctionView.ts'
import type { ListAuctionsQuery } from './auctionsValidation.ts'

type AuctionParams = { auctionId: string }

// The monitor adds and updates sales at any time, so browsers may keep reads but must check back each time.
const readCaching = 'no-cache'

/** GET /api/auctions?period=&from=&to=&limit=&offset= */
export async function list(_req: Request, res: Response<AuctionPage, { validated: { query: ListAuctionsQuery } }>): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json(await getAuctionPage(res.locals.validated.query))
}

/** GET /api/auctions/:auctionId */
export async function show(
  _req: Request,
  res: Response<{ auction: AuctionView }, { validated: { params: AuctionParams } }>,
): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json({ auction: await getAuction(res.locals.validated.params.auctionId) })
}

/** GET /api/auctions/:auctionId/lots — every lot of the sale, for choosing one */
export async function lots(
  _req: Request,
  res: Response<{ lots: LotSummaryView[] }, { validated: { params: AuctionParams } }>,
): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json({ lots: await getAuctionLots(res.locals.validated.params.auctionId) })
}
