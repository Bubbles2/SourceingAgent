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

export type StatusChangeRow = {
  fromStatus: BidRequestStatus | null
  toStatus: BidRequestStatus
  changedAt: Date
  note: string | null
  /** Null for changes made by the system */
  changedByFirstName: string | null
  changedByLastName: string | null
  changedByRole: string | null
}

/** A request's audit trail, oldest first */
export async function listStatusChanges(bidRequestId: string, db: Queryable): Promise<StatusChangeRow[]> {
  const { rows } = await db.query<StatusChangeRow>(
    `SELECT h.from_status AS "fromStatus", h.to_status AS "toStatus", h.changed_at AS "changedAt", h.note,
       u.first_name AS "changedByFirstName", u.last_name AS "changedByLastName", u.role AS "changedByRole"
     FROM request_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.bid_request_id = $1
     ORDER BY h.changed_at, h.id`,
    [bidRequestId],
  )
  return rows
}
