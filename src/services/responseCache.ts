// A short memory of public GET responses (auctions and catalogues). Visitors move back and forth
// between the same pages and calendar months, so a recent answer is reused instead of fetched again,
// and simultaneous requests for the same address share one fetch. The session store clears it when
// someone signs in or out, because administrators can see sales that others can't.
import { apiRequest } from './apiClient'

export const cacheMaxAgeMs = 60_000

type Entry = {
  response: Promise<unknown>
  expiresAt: number
}

const entries = new Map<string, Entry>()

function forgetExpired(now: number): void {
  for (const [path, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(path)
    }
  }
}

/** GETs `path`, or reuses a response from the last minute, and checks it with `parse`. */
export function cachedGet<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const now = Date.now()
  forgetExpired(now)
  let entry = entries.get(path)
  if (!entry) {
    const response = apiRequest(path)
    entry = { response, expiresAt: now + cacheMaxAgeMs }
    entries.set(path, entry)
    // A failed request is forgotten straight away, so the next visit asks again.
    response.catch(() => {
      if (entries.get(path)?.response === response) {
        entries.delete(path)
      }
    })
  }
  return entry.response.then(parse)
}

export function clearCachedResponses(): void {
  entries.clear()
}
