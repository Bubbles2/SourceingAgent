import { apiRequest } from './apiClient'

/** The page calls our administrator API; its server-side service holds the collector token. */
export async function createCollection(maxAuctions: number): Promise<void> {
  await apiRequest('/api/admin/collections', { method: 'POST', body: { maxAuctions } })
}
