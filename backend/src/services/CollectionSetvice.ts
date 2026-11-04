import { config } from '../config/env.ts'
import { HttpError } from '../lib/httpError.ts'

/** Send a collection request to the separate collector using its server-side Bearer token. */
export async function createCollection(maxAuctions: number): Promise<void> {
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
}
