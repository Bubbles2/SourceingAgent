import { config } from '../config/env.ts'
import { HttpError } from '../lib/httpError.ts'
import { z } from 'zod'

const acceptedRun = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  status: z.enum(['queued', 'running', 'completed', 'partial', 'failed']),
})

const runStatus = acceptedRun.extend({
  auctions_discovered: z.number().int().nonnegative(),
  auctions_processed: z.number().int().nonnegative(),
  lots_discovered: z.number().int().nonnegative(),
  lots_saved: z.number().int().nonnegative(),
  lots_failed: z.number().int().nonnegative(),
})

export type CollectionStatus = {
  id: string
  status: z.infer<typeof acceptedRun>['status']
  auctionsDiscovered: number
  auctionsProcessed: number
  lotsDiscovered: number
  lotsSaved: number
  lotsFailed: number
}

function parseRunStatus(value: unknown): CollectionStatus {
  const run = runStatus.safeParse(value)
  if (!run.success) {
    throw new HttpError(502, 'collection_failed', 'The collection service returned an invalid status. Please try again.')
  }
  return {
    id: run.data.id,
    status: run.data.status,
    auctionsDiscovered: run.data.auctions_discovered,
    auctionsProcessed: run.data.auctions_processed,
    lotsDiscovered: run.data.lots_discovered,
    lotsSaved: run.data.lots_saved,
    lotsFailed: run.data.lots_failed,
  }
}

/** Send a collection request to the separate collector using its server-side Bearer token. */
export async function createCollection(maxAuctions: number): Promise<z.infer<typeof acceptedRun>> {
  if (!config.collection.token) {
    throw new HttpError(503, 'collection_not_configured', 'Collection is not configured yet.')
  }

  let response: Response
  try {
    response = await fetch(config.collection.root, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.collection.token}`,
      },
      body: JSON.stringify({ maxAuctions }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HttpError(502, 'collection_unavailable', 'The collection service could not be reached. Please try again.')
  }

  if (!response.ok) {
    throw new HttpError(502, 'collection_failed', 'The collection service did not accept the request. Please try again.')
  }

  const run = acceptedRun.safeParse(await response.json().catch(() => null))
  if (!run.success) {
    throw new HttpError(502, 'collection_failed', 'The collection service returned an invalid response. Please try again.')
  }
  return run.data
}

/** Read one collector job through the administrator API, using its configured base URL. */
export async function getStatus(jobId: string): Promise<CollectionStatus> {
  let response: Response
  try {
    response = await fetch(`${config.collection.root.replace(/\/$/, '')}/${jobId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new HttpError(502, 'collection_unavailable', 'The collection service could not be reached. Please try again.')
  }

  if (response.status === 404) {
    throw new HttpError(404, 'collection_not_found', 'Collection job not found.')
  }
  if (!response.ok) {
    throw new HttpError(502, 'collection_failed', 'The collection status could not be loaded. Please try again.')
  }

  const run = parseRunStatus(await response.json().catch(() => null))
  if (run.id !== jobId) {
    throw new HttpError(502, 'collection_failed', 'The collection service returned an invalid status. Please try again.')
  }
  return run
}

/** Find the latest active collector job; the collector requires the server-side token. */
export async function getRunningJob(): Promise<CollectionStatus | null> {
  if (!config.collection.token) {
    throw new HttpError(503, 'collection_not_configured', 'Collection is not configured yet.')
  }

  let response: Response
  try {
    response = await fetch(`${config.collection.root.replace(/\/$/, '')}/running`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${config.collection.token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new HttpError(502, 'collection_unavailable', 'The collection service could not be reached. Please try again.')
  }

  if (!response.ok) {
    throw new HttpError(502, 'collection_failed', 'The running job could not be checked. Please try again.')
  }

  const run: unknown = await response.json().catch(() => undefined)
  return run === null ? null : parseRunStatus(run)
}
