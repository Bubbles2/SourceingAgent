import type { Request, Response } from 'express'
import { changeAuction, createAuction, getAuction, getAuctionPage, removeAuction, type AuctionPage } from './auctionsService.ts'
import type { AuctionView } from './auctionView.ts'
import type { CreateAuctionBody, ListAuctionsQuery, UpdateAuctionBody } from './auctionsValidation.ts'

type AuctionParams = { auctionId: string }

// Reads may differ by viewer (administrators see drafts), so browsers may keep them but must check
// back each time, and shared caches must not keep them at all.
const readCaching = 'private, no-cache'

function administrator(res: Response) {
  const user = res.locals.auth?.user
  if (!user) {
    throw new Error('auction changes require requireRole')
  }
  return user
}

/** GET /api/auctions?period=&from=&to=&featured=&status=&limit=&offset= */
export async function list(_req: Request, res: Response<AuctionPage, { validated: { query: ListAuctionsQuery } }>): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json(await getAuctionPage(res.locals.validated.query, res.locals.auth?.user))
}

/** GET /api/auctions/:auctionId */
export async function show(
  _req: Request,
  res: Response<{ auction: AuctionView }, { validated: { params: AuctionParams } }>,
): Promise<void> {
  res.set('Cache-Control', readCaching)
  res.json({ auction: await getAuction(res.locals.validated.params.auctionId, res.locals.auth?.user) })
}

/** POST /api/auctions — administrators only */
export async function create(
  _req: Request,
  res: Response<{ auction: AuctionView }, { validated: { body: CreateAuctionBody } }>,
): Promise<void> {
  const auction = await createAuction(res.locals.validated.body, administrator(res))
  res.status(201).json({ auction })
}

/** PATCH /api/auctions/:auctionId — administrators only; cancel with { "status": "cancelled" } */
export async function update(
  _req: Request,
  res: Response<{ auction: AuctionView }, { validated: { params: AuctionParams; body: UpdateAuctionBody } }>,
): Promise<void> {
  const { params, body } = res.locals.validated
  res.json({ auction: await changeAuction(params.auctionId, body, administrator(res)) })
}

/** DELETE /api/auctions/:auctionId — administrators only, for sales without catalogues */
export async function remove(_req: Request, res: Response<void, { validated: { params: AuctionParams } }>): Promise<void> {
  await removeAuction(res.locals.validated.params.auctionId, administrator(res))
  res.status(204).end()
}
