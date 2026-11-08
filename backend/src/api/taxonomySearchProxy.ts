// Hook for the taxonomy search (taxonomy_search/INTEGRATION.md): the admin "Search" tab's API.
// Mounted under /api/admin/search by createAdminRouter, so the administrator role and CSRF checks have
// already run. Each route is listed explicitly and validated here, then forwarded to the service with its
// token (services/taxonomySearchClient.ts).
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { bySignedInUser, rateLimit } from '../middleware/rateLimit.ts'
import { validate } from '../middleware/validate.ts'
import { callTaxonomy } from '../services/taxonomySearchClient.ts'

const mode = z.enum(['exact', 'broad', 'exploratory'])
const version = z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Use a version label such as 0.2.0.')
const jobParams = z.strictObject({ jobId: z.string().regex(/^\d{8}T\d{12}-[0-9a-f]{6}$/, 'Unknown job.') })
const query = z.string().trim().min(2, 'Enter at least 2 characters.').max(200)

const jobBody = z.strictObject({
  command: z.string().regex(/^[a-z-]{1,40}$/, 'Unknown command.'),
  options: z.record(z.string().regex(/^[a-z_]{1,20}$/), z.union([z.boolean(), version])).default({}),
})
const decisionsBody = z.strictObject({
  decisions: z.array(z.strictObject({
    conceptKey: z.string().min(1).max(200),
    decision: z.enum(['approve', 'reject']),
    labelFr: z.string().trim().max(300).optional(),
    labelEn: z.string().trim().max(300).optional(),
  })).min(1).max(500),
  dryRun: z.boolean(),
})
const importBody = z.strictObject({ csv: z.string().min(1).max(90_000), dryRun: z.boolean() })
const candidatesQuery = z.object({
  status: z.enum(['candidate', 'approved', 'rejected', 'all']).default('candidate'),
  dimension: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  provenance: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  version: version.optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const exportQuery = z.object({ status: z.enum(['candidate', 'approved', 'rejected', 'all']).default('candidate'), version: version.optional() })
const settingsBody = z.strictObject({ defaultMode: mode, externalMaxRequests: z.number().int().min(1).max(50) })

function validated<T>(res: Response, part: 'body' | 'query' | 'params'): T {
  return res.locals.validated![part] as T
}

function send(res: Response, data: unknown, status = 200): void {
  res.set('Cache-Control', 'no-store')
  res.status(status).json(data)
}

export function createTaxonomySearchRouter(): Router {
  const router = Router()
  const jobStarts = rateLimit({ windowMs: 60 * 60_000, max: 60, key: bySignedInUser })
  const changes = rateLimit({ windowMs: 60 * 60_000, max: 600, key: bySignedInUser })
  const tests = rateLimit({ windowMs: 60_000, max: 30, key: bySignedInUser })

  // Status and settings
  router.get('/status', async (_req: Request, res: Response) => send(res, (await callTaxonomy('/api/admin/status')).data))
  router.get('/settings', async (_req, res) => send(res, (await callTaxonomy('/api/admin/settings')).data))
  router.put('/settings', changes, validate({ body: settingsBody }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/settings', { method: 'PUT', body: validated(res, 'body') })).data))

  // Jobs
  router.get('/jobs/commands', async (_req, res) => send(res, (await callTaxonomy('/api/admin/jobs/commands')).data))
  router.get('/jobs', async (_req, res) => send(res, (await callTaxonomy('/api/admin/jobs', { query: { limit: 15 } })).data))
  router.post('/jobs', jobStarts, validate({ body: jobBody }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/jobs', { method: 'POST', body: validated(res, 'body') })).data, 202))
  router.get('/jobs/:jobId', validate({ params: jobParams }), async (_req, res) => {
    const { jobId } = validated<{ jobId: string }>(res, 'params')
    send(res, (await callTaxonomy(`/api/admin/jobs/${jobId}`, { query: { lines: 300 } })).data)
  })
  router.post('/jobs/:jobId/cancel', changes, validate({ params: jobParams }), async (_req, res) => {
    const { jobId } = validated<{ jobId: string }>(res, 'params')
    send(res, (await callTaxonomy(`/api/admin/jobs/${jobId}/cancel`, { method: 'POST' })).data)
  })

  // Taxonomy review
  router.get('/taxonomy/candidates', validate({ query: candidatesQuery }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/taxonomy/candidates', { query: validated(res, 'query') })).data))
  router.post('/taxonomy/decisions', changes, validate({ body: decisionsBody }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/taxonomy/decisions', { method: 'POST', body: validated(res, 'body') })).data))
  router.post('/taxonomy/import', changes, validate({ body: importBody }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/taxonomy/import', { method: 'POST', body: validated(res, 'body'), timeoutMs: 120_000 })).data))
  router.get('/taxonomy/export.csv', validate({ query: exportQuery }), async (_req, res) => {
    const reply = await callTaxonomy('/api/admin/taxonomy/export.csv', { query: validated(res, 'query') })
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', reply.disposition ?? 'attachment; filename="review.csv"')
    res.type('text/csv; charset=utf-8').send(reply.text)
  })
  router.post('/taxonomy/publish/check', changes, validate({ body: z.strictObject({ version }) }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/taxonomy/publish/check', { method: 'POST', body: validated(res, 'body') })).data))

  // Search tools (tests: not recorded in the search log)
  router.post('/tools/expand', tests, validate({ body: z.strictObject({ query, searchDepth: mode }) }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/search/expand', { method: 'POST', body: validated(res, 'body') })).data))
  router.post('/tools/search', tests, validate({ body: z.strictObject({ query, mode, limit: z.number().int().min(1).max(50) }) }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/tools/search', { method: 'POST', body: validated(res, 'body') })).data))
  router.post('/tools/external', tests, validate({
    body: z.strictObject({ query, searchDepth: mode, maxRequests: z.number().int().min(1).max(50), limit: z.number().int().min(1).max(50) }),
  }), async (_req, res) =>
    send(res, (await callTaxonomy('/api/admin/tools/external', { method: 'POST', body: validated(res, 'body'), timeoutMs: 60_000 })).data))

  // Quality
  router.get('/reports', async (_req, res) => send(res, (await callTaxonomy('/api/admin/reports')).data))
  router.get('/reports/:name', validate({ params: z.strictObject({ name: z.string().regex(/^[a-z0-9_]{1,64}$/) }) }), async (_req, res) => {
    const { name } = validated<{ name: string }>(res, 'params')
    send(res, (await callTaxonomy(`/api/admin/reports/${name}`)).data)
  })
  router.get('/benchmark', async (_req, res) => send(res, (await callTaxonomy('/api/admin/benchmark')).data))
  router.get('/search-log', async (_req, res) => send(res, (await callTaxonomy('/api/admin/search-log', { query: { limit: 30 } })).data))

  return router
}
