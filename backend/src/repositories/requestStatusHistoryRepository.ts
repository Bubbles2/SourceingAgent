import type { Queryable } from '../db/pool.ts'
import type { BidRequestStatus } from './bidRequestsRepository.ts'

/** Appends to the audit trail. Rows can't be changed or deleted afterwards (database trigger). */
export async function recordStatusChange(
  change: {
    bidRequestId: string
    fromStatus: BidRequestStatus | null
    toStatus: BidRequestStatus
    /** Who made the change; null for the system */
    changedBy: string | null
    note?: string
  },
  db: Queryable,
): Promise<void> {
  await db.query(
    'INSERT INTO request_status_history (bid_request_id, from_status, to_status, changed_by, note) VALUES ($1, $2, $3, $4, $5)',
    [change.bidRequestId, change.fromStatus, change.toStatus, change.changedBy, change.note ?? null],
  )
}
