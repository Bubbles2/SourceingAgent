import { ApiError, apiRequest } from './apiClient'

type RunState = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

export type CollectionStatus = {
  id: string
  status: RunState
  auctionsDiscovered: number
  auctionsProcessed: number
  lotsDiscovered: number
  lotsSaved: number
  lotsFailed: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRunState(value: unknown): value is RunState {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'partial' || value === 'failed'
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function readRun(value: unknown): { id: string; status: RunState } {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[1-9]\d*$/.test(value.id) || !isRunState(value.status)) {
    throw new ApiError(502, 'unexpected_response', 'The collection service returned an invalid response.')
  }
  return { id: value.id, status: value.status }
}

/** The page calls our administrator API; its server-side service holds the collector token. */
export async function createCollection(maxAuctions: number): Promise<{ id: string; status: RunState }> {
  return readRun(await apiRequest('/api/admin/collections', { method: 'POST', body: { maxAuctions } }))
}

function readStatus(value: unknown): CollectionStatus {
  const run = readRun(value)
  if (!isRecord(value) ||
    !isCount(value.auctionsDiscovered) ||
    !isCount(value.auctionsProcessed) ||
    !isCount(value.lotsDiscovered) ||
    !isCount(value.lotsSaved) ||
    !isCount(value.lotsFailed)) {
    throw new ApiError(502, 'unexpected_response', 'The collection service returned an invalid status.')
  }
  return {
    ...run,
    auctionsDiscovered: value.auctionsDiscovered,
    auctionsProcessed: value.auctionsProcessed,
    lotsDiscovered: value.lotsDiscovered,
    lotsSaved: value.lotsSaved,
    lotsFailed: value.lotsFailed,
  }
}

/** Look up a job by the ID returned when the collection was started. */
export async function getStatus(jobId: string): Promise<CollectionStatus> {
  return readStatus(await apiRequest(`/api/admin/collections/${encodeURIComponent(jobId)}`))
}

/** Ask the administrator API for the latest running job, if there is one. */
export async function getRunningJob(): Promise<CollectionStatus | null> {
  const value = await apiRequest('/api/admin/collections/running')
  return value === null ? null : readStatus(value)
}
