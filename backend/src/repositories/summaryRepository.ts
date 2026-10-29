import { pool } from '../db/pool.ts'
import { saleIsOpen } from './saleTimes.ts'

/** Counts for the administration dashboard */
export type AdminSummary = {
  /** Sales whose sale day hasn't ended (Paris time) */
  upcomingAuctions: number
  /** Sales whose sale day has ended */
  completedAuctions: number
  /** Lots in upcoming sales, as the dashboard card's list shows them */
  upcomingLots: number
  pendingRequests: number
  acceptedRequests: number
  placedBids: number
}

export async function readAdminSummary(): Promise<AdminSummary> {
  const { rows } = await pool.query<AdminSummary>(
    `SELECT
       (SELECT count(*)::int FROM auctions a WHERE ${saleIsOpen}) AS "upcomingAuctions",
       (SELECT count(*)::int FROM auctions a WHERE NOT ${saleIsOpen}) AS "completedAuctions",
       (SELECT count(*)::int FROM lots l JOIN auctions a ON a.id = l.auction_id WHERE ${saleIsOpen}) AS "upcomingLots",
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
