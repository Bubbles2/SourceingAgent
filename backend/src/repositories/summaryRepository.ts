import { pool } from '../db/pool.ts'
import { saleIsOpen } from './saleTimes.ts'

/** Counts for the administration dashboard */
export type AdminSummary = {
  /** Published sales whose sale day hasn't ended (Paris time) */
  upcomingAuctions: number
  draftAuctions: number
  /** Published sales whose sale day has ended */
  completedAuctions: number
  /** Catalogues of published sales that haven't ended, as the dashboard card's list shows them */
  publishedCatalogues: number
  pendingRequests: number
  acceptedRequests: number
  placedBids: number
}

export async function readAdminSummary(): Promise<AdminSummary> {
  const { rows } = await pool.query<AdminSummary>(
    `SELECT
       (SELECT count(*)::int FROM auctions a WHERE a.status = 'published' AND ${saleIsOpen}) AS "upcomingAuctions",
       (SELECT count(*)::int FROM auctions a WHERE a.status = 'draft') AS "draftAuctions",
       (SELECT count(*)::int FROM auctions a WHERE a.status = 'published' AND NOT (${saleIsOpen})) AS "completedAuctions",
       (SELECT count(*)::int FROM catalogues c JOIN auctions a ON a.id = c.auction_id
         WHERE a.status = 'published' AND ${saleIsOpen}) AS "publishedCatalogues",
       (SELECT count(*)::int FROM bid_requests WHERE status = 'pending') AS "pendingRequests",
       (SELECT count(*)::int FROM bid_requests WHERE status = 'accepted') AS "acceptedRequests",
       (SELECT count(*)::int FROM bid_requests WHERE status = 'placed') AS "placedBids"`,
  )
  const summary = rows[0]
  if (!summary) {
    throw new Error('The summary query returned no row')
  }
  return summary
}
