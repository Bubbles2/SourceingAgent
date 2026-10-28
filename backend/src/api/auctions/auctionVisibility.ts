// Who sees which sales. Everyone sees published sales and their catalogues; only administrators
// see drafts and cancelled sales.
import { HttpError } from '../../lib/httpError.ts'
import { auctionStatuses, type AuctionStatus } from '../../repositories/auctionsRepository.ts'
import type { UserRecord } from '../../repositories/usersRepository.ts'

/** A status filter from a list request; "all" is every status */
export type StatusFilter = AuctionStatus | 'all'

export const statusFilters: readonly StatusFilter[] = [...auctionStatuses, 'all']

function isAdministrator(viewer: UserRecord | undefined): boolean {
  return viewer?.role === 'administrator'
}

/** The statuses a list may include. Asking for anything but published needs an administrator. */
export function listableStatuses(filter: StatusFilter, viewer: UserRecord | undefined): AuctionStatus[] {
  if (filter === 'published') {
    return ['published']
  }
  if (!viewer) {
    throw new HttpError(401, 'unauthenticated', 'Sign in to continue.')
  }
  if (!isAdministrator(viewer)) {
    throw new HttpError(403, 'forbidden', 'Only administrators can see draft and cancelled sales.')
  }
  return filter === 'all' ? [...auctionStatuses] : [filter]
}

/** Unpublished sales don't exist as far as visitors and customers can tell. */
export function canSee(status: AuctionStatus, viewer: UserRecord | undefined): boolean {
  return status === 'published' || isAdministrator(viewer)
}
