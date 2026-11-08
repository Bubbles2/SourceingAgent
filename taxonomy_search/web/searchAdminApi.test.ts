import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../../src/services/apiClient'
import {
  addOutcomes,
  candidateQuery,
  exportCsvUrl,
  getJobs,
  getStatus,
  parseCriteria,
  parseTestSearch,
  sendDecisions,
  startJob,
} from './searchAdminApi'

vi.mock('../../src/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiClient')>()),
  apiRequest: vi.fn(),
}))

const request = vi.mocked(apiRequest)

const job = {
  id: '20261108T180645123456-9dd792',
  command: 'classify-lots',
  label: 'Classify lots',
  options: { affected: true },
  status: 'running',
  exit_code: null,
  started_at: '2026-11-08T18:06:45+00:00',
  finished_at: null,
}

beforeEach(() => request.mockReset())

describe('search administration API', () => {
  it('reads the status, including the running job', async () => {
    request.mockResolvedValueOnce({
      taxonomyScope: 'draft',
      publishedVersion: null,
      concepts: 176,
      embeddingModel: 'm',
      collector: { auctions: 122, lots: 20923, lastCollected: '2026-11-07T01:56:25+00:00' },
      classification: { lots: 20923, flagged: 3220, lastRun: null },
      index: { lots: 20923, lastRun: null },
      embeddings: { lots: 20923, lastRun: null },
      searches: 22,
      versions: [{ label: '0.2.0', status: 'draft', createdAt: null, publishedAt: null, concepts: 952, candidates: 952, approved: 0, rejected: 0, relationships: 290 }],
      runningJob: job,
    })
    const status = await getStatus()
    expect(request).toHaveBeenCalledWith('/api/admin/search/status')
    expect(status.collector.lots).toBe(20923)
    expect(status.runningJob?.options).toEqual({ affected: true })
    expect(status.versions[0].candidates).toBe(952)
  })

  it('rejects a status that breaks the contract', async () => {
    request.mockResolvedValueOnce({ taxonomyScope: 'draft' })
    await expect(getStatus()).rejects.toMatchObject({ code: 'unexpected_response' })
  })

  it('starts jobs and lists them', async () => {
    request.mockResolvedValueOnce(job)
    await startJob('classify-lots', { affected: true })
    expect(request).toHaveBeenCalledWith('/api/admin/search/jobs', { method: 'POST', body: { command: 'classify-lots', options: { affected: true } } })
    request.mockResolvedValueOnce({ running: null, jobs: [{ ...job, status: 'succeeded', exit_code: 0, finished_at: '2026-11-08T18:06:50+00:00' }] })
    const { running, jobs } = await getJobs()
    expect(running).toBeNull()
    expect(jobs[0]).toMatchObject({ status: 'succeeded', exitCode: 0 })
  })

  it('builds review queries and sends decisions as dry runs or for real', async () => {
    expect(candidateQuery({ status: 'candidate', dimension: 'style', version: '0.2.0', provenance: '', q: ' Louis ', offset: 50 }))
      .toBe('status=candidate&limit=50&offset=50&dimension=style&version=0.2.0&q=Louis')
    expect(exportCsvUrl('all', '')).toBe('/api/admin/search/taxonomy/export.csv?status=all')
    const outcome = { dryRun: true, approved: 1, rejected: 0, labelsChanged: 1, termsUpdated: 2, relationshipsUpdated: 0, unknownKeys: [], invalidRows: [] }
    request.mockResolvedValueOnce(outcome)
    const result = await sendDecisions([{ conceptKey: 'style.louis_xiv', decision: 'approve' }], true)
    expect(request).toHaveBeenCalledWith('/api/admin/search/taxonomy/decisions', {
      method: 'POST',
      body: { decisions: [{ conceptKey: 'style.louis_xiv', decision: 'approve' }], dryRun: true },
    })
    expect(addOutcomes(result, { ...outcome, dryRun: false, unknownKeys: ['x'] })).toMatchObject({ approved: 2, dryRun: false, unknownKeys: ['x'] })
  })

  it('reads the search criteria and a test search', () => {
    const criteria = parseCriteria({
      concepts: ['furniture'],
      unresolvedTerms: [],
      taxonomyScope: 'draft',
      criteria: {
        groups: [{ text: 'furniture', required: true, dimension: 'category', terms: { fr: [{ term: 'Mobilier' }], en: [{ term: 'Furniture' }] }, covered: { fr: { 'Meubles de rangement': 'Meubles' }, en: {} } }],
        soft_words: ['vintage'],
        boolean: { fr: '"Mobilier"', en: '"Furniture"' },
        phrases: { fr: [{ term: 'Mobilier' }], en: [] },
      },
    })
    expect(criteria.ideas[0]).toMatchObject({ fr: ['Mobilier'], en: ['Furniture'], covered: ['Meubles de rangement'] })
    expect(criteria.softWords).toEqual(['vintage'])
    const search = parseTestSearch({
      mode: 'exact', took_ms: 12, total_direct: 1, total_related: 0,
      understanding: { concepts: [{ concepts: ['period.louis_xiv'] }], unresolved_terms: [] },
      direct: [{ lot_id: 6928, title: 'Commode', excerpt: '', auction_date: null, match_type: 'direct', explanation: ['taxonomy: period.louis_xiv dated_to'] }],
      related: [],
    })
    expect(search.direct[0]).toMatchObject({ lotId: '6928', explanation: ['taxonomy: period.louis_xiv dated_to'] })
    expect(search.concepts).toEqual(['period.louis_xiv'])
  })
})
