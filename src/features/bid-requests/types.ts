export const bidRequestStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'placed', 'won', 'lost'] as const

export type BidRequestStatus = (typeof bidRequestStatuses)[number]
