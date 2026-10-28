import { apiRequest } from '../../services/apiClient'
import { integer, nested, record } from '../../services/responseFields'

/** Counts for the dashboard (GET /api/admin/summary) */
export type AdminSummary = {
  /** Published sales whose sale day hasn't ended */
  upcomingAuctions: number
  draftAuctions: number
  /** Published sales whose sale day has ended */
  completedAuctions: number
  /** Catalogues of published sales */
  publishedCatalogues: number
  pendingRequests: number
  acceptedRequests: number
  placedBids: number
}

export function parseAdminSummary(data: unknown): AdminSummary {
  const fields = nested(record(data), 'summary')
  return {
    upcomingAuctions: integer(fields, 'upcomingAuctions'),
    draftAuctions: integer(fields, 'draftAuctions'),
    completedAuctions: integer(fields, 'completedAuctions'),
    publishedCatalogues: integer(fields, 'publishedCatalogues'),
    pendingRequests: integer(fields, 'pendingRequests'),
    acceptedRequests: integer(fields, 'acceptedRequests'),
    placedBids: integer(fields, 'placedBids'),
  }
}

export async function getAdminSummary(): Promise<AdminSummary> {
  return parseAdminSummary(await apiRequest('/api/admin/summary'))
}
