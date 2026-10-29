import { apiRequest } from '../../services/apiClient'
import { integer, nested, record } from '../../services/responseFields'

/** Counts for the dashboard (GET /api/admin/summary) */
export type AdminSummary = {
  /** Sales whose sale day hasn't ended */
  upcomingAuctions: number
  /** Sales whose sale day has ended */
  completedAuctions: number
  /** Lots in upcoming sales */
  upcomingLots: number
  pendingRequests: number
  acceptedRequests: number
  placedBids: number
}

export function parseAdminSummary(data: unknown): AdminSummary {
  const fields = nested(record(data), 'summary')
  return {
    upcomingAuctions: integer(fields, 'upcomingAuctions'),
    completedAuctions: integer(fields, 'completedAuctions'),
    upcomingLots: integer(fields, 'upcomingLots'),
    pendingRequests: integer(fields, 'pendingRequests'),
    acceptedRequests: integer(fields, 'acceptedRequests'),
    placedBids: integer(fields, 'placedBids'),
  }
}

export async function getAdminSummary(): Promise<AdminSummary> {
  return parseAdminSummary(await apiRequest('/api/admin/summary'))
}
