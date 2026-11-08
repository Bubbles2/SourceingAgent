// Site search, answered by the taxonomy search service (taxonomy_search/, see taxonomy_search/INTEGRATION.md).
// The service ranks lots and says why each one matched; the lots themselves are read here, so search results
// have exactly the fields of /api/lots plus whether a bid can still be requested.
import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../lib/httpError.ts'
import { byClientIp, rateLimit } from '../../middleware/rateLimit.ts'
import { findLotsByIds, type FoundLotRecord } from '../../repositories/lotsRepository.ts'
import { callTaxonomy } from '../../services/taxonomySearchClient.ts'
import { toLotWithAuctionView } from '../lots/lotView.ts'

const querySchema = z.string().trim().min(2).max(200)
const modeSchema = z.enum(['exact', 'broad', 'exploratory']).optional()
const hitSchema = z.object({
  lot_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]{0,14}$/)]),
  match_type: z.enum(['direct', 'related']),
  explanation: z.array(z.string()),
})
const responseSchema = z.object({
  mode: z.string(),
  taxonomyScope: z.string(),
  total_direct: z.number().int(),
  total_related: z.number().int(),
  direct: z.array(hitSchema).max(100),
  related: z.array(hitSchema).max(100),
  understanding: z.object({
    concepts: z.array(z.object({ text: z.string(), concepts: z.array(z.string()) })).default([]),
    unresolved_terms: z.array(z.string()).default([]),
  }),
  labels: z.record(z.string(), z.string()).default({}),
})

type Hit = z.infer<typeof hitSchema>

export const searchRouter = Router()

searchRouter.get('/', rateLimit({ windowMs: 60_000, max: 20, key: byClientIp }), async (req, res) => {
  const query = querySchema.safeParse(req.query.q)
  if (!query.success) {
    throw new HttpError(400, 'invalid_query', 'Enter between 2 and 200 characters to search.')
  }
  const mode = modeSchema.safeParse(req.query.mode === '' ? undefined : req.query.mode)
  if (!mode.success) {
    throw new HttpError(400, 'invalid_query', 'Choose the exact, broad or exploratory search.')
  }

  // Without a mode the service uses the default set by administrators (Search tab, Search tools).
  const reply = await callTaxonomy('/api/search', { method: 'POST', body: { query: query.data, mode: mode.data, limit: 30 }, timeoutMs: 20_000 })
  const result = responseSchema.safeParse(reply.data)
  if (!result.success) {
    throw new HttpError(502, 'search_response_invalid', 'The search service returned an unexpected response.')
  }
  const { direct, related } = result.data
  const lots = new Map((await findLotsByIds([...direct, ...related].map((hit) => String(hit.lot_id)))).map((lot) => [String(lot.id), lot]))

  function toResult(hit: Hit): object[] {
    const lot: FoundLotRecord | undefined = lots.get(String(hit.lot_id))
    if (!lot) return [] // no longer listed by the collector
    const { saleOpen, ...record } = lot
    return [{ ...toLotWithAuctionView(record), saleOpen, matchType: hit.match_type, explanation: hit.explanation }]
  }

  res.set('Cache-Control', 'no-store')
  res.json({
    query: query.data,
    mode: result.data.mode,
    taxonomyScope: result.data.taxonomyScope,
    totalDirect: result.data.total_direct,
    totalRelated: result.data.total_related,
    understanding: {
      ideas: result.data.understanding.concepts.map((idea) => ({ text: idea.text, concepts: idea.concepts })),
      unresolvedTerms: result.data.understanding.unresolved_terms,
    },
    labels: result.data.labels,
    direct: direct.flatMap(toResult),
    related: related.flatMap(toResult),
  })
})
