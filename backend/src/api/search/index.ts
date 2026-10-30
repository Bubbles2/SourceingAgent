import { Router } from 'express'
import { z } from 'zod'
import { config } from '../../config/env.ts'
import { HttpError } from '../../lib/httpError.ts'
import { byClientIp, rateLimit } from '../../middleware/rateLimit.ts'

const querySchema = z.string().trim().min(2).max(200)
const resultSchema = z.object({
  titleuk: z.string().nullish(),
  title: z.string().nullish(),
  descriptionuk: z.string().nullish(),
  description: z.string().nullish(),
  auction_date: z.string().nullish(),
  estimate_low: z.union([z.string(), z.number()]).nullish(),
  estimate_high: z.union([z.string(), z.number()]).nullish(),
  currency: z.string().nullish(),
  source_url: z.url().nullish().transform((value) => value?.startsWith('https://') ? value : null),
  lot_number: z.union([z.string(), z.number()]).nullish(),
}).passthrough()
const responseSchema = z.object({ results: z.array(resultSchema).max(100), count: z.number().optional() }).passthrough()

export const searchRouter = Router()

searchRouter.get('/', rateLimit({ windowMs: 60_000, max: 20, key: byClientIp }), async (req, res) => {
  const parsed = querySchema.safeParse(req.query.q)
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_query', 'Enter between 2 and 200 characters to search.')
  }
  if (!config.search.apiKey) {
    throw new HttpError(503, 'search_unavailable', 'Search is not configured yet. Add the n8n API key to the backend settings.')
  }

  let upstream: Response
  try {
    upstream = await fetch(config.search.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': config.search.apiKey },
      body: JSON.stringify({ query: parsed.data, format: 'json', limit: 20 }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(502, 'search_unavailable', 'The search workflow could not be reached. Please try again.')
  }
  if (!upstream.ok) {
    throw new HttpError(502, 'search_unavailable', 'The search workflow could not complete this search. Please try again.')
  }

  let body: unknown
  try {
    body = await upstream.json()
  } catch {
    throw new HttpError(502, 'search_response_invalid', 'The search workflow returned an invalid response.')
  }
  const result = responseSchema.safeParse(body)
  if (!result.success) {
    throw new HttpError(502, 'search_response_invalid', 'The search workflow returned an unexpected response.')
  }
  res.set('Cache-Control', 'no-store')
  res.json({ query: parsed.data, count: result.data.count ?? result.data.results.length, results: result.data.results })
})
