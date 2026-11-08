// Calls behind the admin "Search" tab. Every path goes through the Sourcing agent's back end
// (/api/admin/search/...), which checks that the user is an administrator and forwards the call to the
// taxonomy search service. Responses are checked field by field, like the rest of the site.
import { apiRequest } from '../../src/services/apiClient'
import {
  boolean,
  contractError,
  integer,
  isRecord,
  list,
  nested,
  nullableInteger,
  nullableText,
  oneOf,
  record,
  text,
  textList,
  type Fields,
} from '../../src/services/responseFields'

export const searchAdminBase = '/api/admin/search'

// ---- small readers ---------------------------------------------------------------------------

function num(fields: Fields, key: string): number {
  const value = fields[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw contractError()
  return value
}

function optionalText(fields: Fields, key: string): string | null {
  const value = fields[key]
  return value === undefined || value === null ? null : text(fields, key)
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

// ---- status, settings ------------------------------------------------------------------------

export const searchModes = ['exact', 'broad', 'exploratory'] as const
export type SearchMode = (typeof searchModes)[number]

export type VersionSummary = {
  label: string
  status: string
  createdAt: string | null
  publishedAt: string | null
  concepts: number
  candidates: number
  approved: number
  rejected: number
  relationships: number
}

export type Progress = { lots: number; lastRun: string | null }

export type SearchStatus = {
  taxonomyScope: string
  publishedVersion: string | null
  concepts: number
  embeddingModel: string
  collector: { auctions: number; lots: number; lastCollected: string | null }
  classification: Progress & { flagged: number }
  index: Progress
  embeddings: Progress
  searches: number
  versions: VersionSummary[]
  runningJob: Job | null
}

function progress(fields: Fields): Progress {
  return { lots: integer(fields, 'lots'), lastRun: nullableText(fields, 'lastRun') }
}

export function parseStatus(data: unknown): SearchStatus {
  const fields = record(data)
  const collector = nested(fields, 'collector')
  const classification = nested(fields, 'classification')
  return {
    taxonomyScope: text(fields, 'taxonomyScope'),
    publishedVersion: nullableText(fields, 'publishedVersion'),
    concepts: integer(fields, 'concepts'),
    embeddingModel: text(fields, 'embeddingModel'),
    collector: {
      auctions: integer(collector, 'auctions'),
      lots: integer(collector, 'lots'),
      lastCollected: nullableText(collector, 'lastCollected'),
    },
    classification: { ...progress(classification), flagged: integer(classification, 'flagged') },
    index: progress(nested(fields, 'index')),
    embeddings: progress(nested(fields, 'embeddings')),
    searches: integer(fields, 'searches'),
    versions: list(fields, 'versions').map((value) => {
      const v = record(value)
      return {
        label: text(v, 'label'),
        status: text(v, 'status'),
        createdAt: nullableText(v, 'createdAt'),
        publishedAt: nullableText(v, 'publishedAt'),
        concepts: integer(v, 'concepts'),
        candidates: integer(v, 'candidates'),
        approved: integer(v, 'approved'),
        rejected: integer(v, 'rejected'),
        relationships: integer(v, 'relationships'),
      }
    }),
    runningJob: fields.runningJob === null ? null : parseJob(fields.runningJob),
  }
}

export async function getStatus(): Promise<SearchStatus> {
  return parseStatus(await apiRequest(`${searchAdminBase}/status`))
}

export type SearchSettings = { defaultMode: SearchMode; externalMaxRequests: number }

function parseSettings(data: unknown): SearchSettings {
  const fields = record(data)
  return { defaultMode: oneOf(fields, 'defaultMode', searchModes), externalMaxRequests: integer(fields, 'externalMaxRequests') }
}

export async function getSettings(): Promise<SearchSettings> {
  return parseSettings(await apiRequest(`${searchAdminBase}/settings`))
}

export async function saveSettings(settings: SearchSettings): Promise<SearchSettings> {
  return parseSettings(await apiRequest(`${searchAdminBase}/settings`, { method: 'PUT', body: settings }))
}

// ---- jobs ------------------------------------------------------------------------------------

export const jobStatuses = ['running', 'succeeded', 'failed', 'cancelled', 'interrupted'] as const
export type JobStatus = (typeof jobStatuses)[number]

export type Job = {
  id: string
  command: string
  label: string
  options: Record<string, boolean | string>
  status: JobStatus
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
  log: string | null
}

export function parseJob(data: unknown): Job {
  const fields = record(data)
  const options: Record<string, boolean | string> = {}
  const rawOptions = isRecord(fields.options) ? fields.options : {}
  for (const [key, value] of Object.entries(rawOptions)) {
    if (typeof value === 'boolean' || typeof value === 'string') options[key] = value
  }
  return {
    id: text(fields, 'id'),
    command: text(fields, 'command'),
    label: text(fields, 'label'),
    options,
    status: oneOf(fields, 'status', jobStatuses),
    exitCode: nullableInteger(fields, 'exit_code'),
    startedAt: text(fields, 'started_at'),
    finishedAt: nullableText(fields, 'finished_at'),
    log: optionalText(fields, 'log'),
  }
}

export type JobCommand = { command: string; label: string; description: string; options: string[]; needsVersion: boolean }

export async function getJobCommands(): Promise<JobCommand[]> {
  const data = await apiRequest(`${searchAdminBase}/jobs/commands`)
  if (!Array.isArray(data)) throw contractError()
  return data.map((value) => {
    const fields = record(value)
    return {
      command: text(fields, 'command'),
      label: text(fields, 'label'),
      description: text(fields, 'description'),
      options: textList(fields, 'options'),
      needsVersion: boolean(fields, 'needsVersion'),
    }
  })
}

export async function getJobs(): Promise<{ running: Job | null; jobs: Job[] }> {
  const fields = record(await apiRequest(`${searchAdminBase}/jobs?limit=15`))
  return { running: fields.running === null ? null : parseJob(fields.running), jobs: list(fields, 'jobs').map(parseJob) }
}

export async function getJob(id: string): Promise<Job> {
  return parseJob(await apiRequest(`${searchAdminBase}/jobs/${encodeURIComponent(id)}?lines=300`))
}

export async function startJob(command: string, options: Record<string, boolean | string> = {}): Promise<Job> {
  return parseJob(await apiRequest(`${searchAdminBase}/jobs`, { method: 'POST', body: { command, options } }))
}

export async function cancelJob(id: string): Promise<Job> {
  return parseJob(await apiRequest(`${searchAdminBase}/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }))
}

// ---- taxonomy review -------------------------------------------------------------------------

export const reviewStatuses = ['candidate', 'approved', 'rejected', 'all'] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

export type Candidate = {
  conceptKey: string
  dimension: string
  labelFr: string | null
  labelEn: string | null
  broader: string | null
  confidence: number
  lots: number | null
  auctions: number | null
  topCategories: string | null
  englishInData: string | null
  provenance: string
  version: string
  status: string
  example: string | null
}

export type CandidateFilters = {
  status: ReviewStatus
  dimension: string
  version: string
  provenance: string
  q: string
  offset: number
}

export type CandidatePage = { items: Candidate[]; total: number; limit: number; offset: number }

export function candidateQuery(filters: CandidateFilters, limit = 50): string {
  const params = new URLSearchParams({ status: filters.status, limit: String(limit), offset: String(filters.offset) })
  if (filters.dimension) params.set('dimension', filters.dimension)
  if (filters.version) params.set('version', filters.version)
  if (filters.provenance) params.set('provenance', filters.provenance)
  if (filters.q.trim()) params.set('q', filters.q.trim())
  return params.toString()
}

export function parseCandidatePage(data: unknown): CandidatePage {
  const fields = record(data)
  return {
    total: integer(fields, 'total'),
    limit: integer(fields, 'limit'),
    offset: integer(fields, 'offset'),
    items: list(fields, 'items').map((value) => {
      const c = record(value)
      return {
        conceptKey: text(c, 'conceptKey'),
        dimension: text(c, 'dimension'),
        labelFr: nullableText(c, 'labelFr'),
        labelEn: nullableText(c, 'labelEn'),
        broader: nullableText(c, 'broader'),
        confidence: num(c, 'confidence'),
        lots: nullableInteger(c, 'lots'),
        auctions: nullableInteger(c, 'auctions'),
        topCategories: nullableText(c, 'topCategories'),
        englishInData: nullableText(c, 'englishInData'),
        provenance: text(c, 'provenance'),
        version: text(c, 'version'),
        status: text(c, 'status'),
        example: nullableText(c, 'example'),
      }
    }),
  }
}

export async function listCandidates(filters: CandidateFilters): Promise<CandidatePage> {
  return parseCandidatePage(await apiRequest(`${searchAdminBase}/taxonomy/candidates?${candidateQuery(filters)}`))
}

export function exportCsvUrl(status: ReviewStatus, version: string): string {
  const params = new URLSearchParams({ status })
  if (version) params.set('version', version)
  return `${searchAdminBase}/taxonomy/export.csv?${params.toString()}`
}

export type Decision = { conceptKey: string; decision: 'approve' | 'reject'; labelFr?: string; labelEn?: string }

export type ReviewOutcome = {
  dryRun: boolean
  approved: number
  rejected: number
  labelsChanged: number
  termsUpdated: number
  relationshipsUpdated: number
  unknownKeys: string[]
  invalidRows: string[]
}

export function parseOutcome(data: unknown): ReviewOutcome {
  const fields = record(data)
  return {
    dryRun: boolean(fields, 'dryRun'),
    approved: integer(fields, 'approved'),
    rejected: integer(fields, 'rejected'),
    labelsChanged: integer(fields, 'labelsChanged'),
    termsUpdated: integer(fields, 'termsUpdated'),
    relationshipsUpdated: integer(fields, 'relationshipsUpdated'),
    unknownKeys: textList(fields, 'unknownKeys'),
    invalidRows: textList(fields, 'invalidRows'),
  }
}

export function addOutcomes(a: ReviewOutcome, b: ReviewOutcome): ReviewOutcome {
  return {
    dryRun: a.dryRun && b.dryRun,
    approved: a.approved + b.approved,
    rejected: a.rejected + b.rejected,
    labelsChanged: a.labelsChanged + b.labelsChanged,
    termsUpdated: a.termsUpdated + b.termsUpdated,
    relationshipsUpdated: a.relationshipsUpdated + b.relationshipsUpdated,
    unknownKeys: [...a.unknownKeys, ...b.unknownKeys],
    invalidRows: [...a.invalidRows, ...b.invalidRows],
  }
}

export async function sendDecisions(decisions: Decision[], dryRun: boolean): Promise<ReviewOutcome> {
  return parseOutcome(
    await apiRequest(`${searchAdminBase}/taxonomy/decisions`, { method: 'POST', body: { decisions, dryRun } }),
  )
}

export async function importCsvChunk(csv: string, dryRun: boolean): Promise<ReviewOutcome> {
  return parseOutcome(await apiRequest(`${searchAdminBase}/taxonomy/import`, { method: 'POST', body: { csv, dryRun } }))
}

export type PublishCheck = { version: string; canPublish: boolean; issues: { level: string; message: string }[] }

export async function checkPublication(version: string): Promise<PublishCheck> {
  const fields = record(await apiRequest(`${searchAdminBase}/taxonomy/publish/check`, { method: 'POST', body: { version } }))
  return {
    version: text(fields, 'version'),
    canPublish: boolean(fields, 'canPublish'),
    issues: list(fields, 'issues').map((value) => {
      const issue = record(value)
      return { level: text(issue, 'level'), message: text(issue, 'message') }
    }),
  }
}

// ---- search tools ----------------------------------------------------------------------------

export type CriteriaIdea = { text: string; required: boolean; dimension: string; fr: string[]; en: string[]; covered: string[] }

export type Criteria = {
  concepts: string[]
  unresolvedTerms: string[]
  taxonomyScope: string
  ideas: CriteriaIdea[]
  softWords: string[]
  boolean: { fr: string; en: string }
  phrases: { fr: string[]; en: string[] }
}

function termList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (isRecord(item) && typeof item.term === 'string' ? [item.term] : [])) : []
}

export function parseCriteria(data: unknown): Criteria {
  const fields = record(data)
  const criteria = nested(fields, 'criteria')
  const bool = isRecord(criteria.boolean) ? criteria.boolean : {}
  const phrases = isRecord(criteria.phrases) ? criteria.phrases : {}
  return {
    concepts: textList(fields, 'concepts'),
    unresolvedTerms: textList(fields, 'unresolvedTerms'),
    taxonomyScope: text(fields, 'taxonomyScope'),
    ideas: list(criteria, 'groups').map((value) => {
      const group = record(value)
      const terms = isRecord(group.terms) ? group.terms : {}
      const covered = isRecord(group.covered) ? group.covered : {}
      const coveredWords = Object.values(covered).flatMap((byLanguage) => (isRecord(byLanguage) ? Object.keys(byLanguage) : []))
      return {
        text: text(group, 'text'),
        required: boolean(group, 'required'),
        dimension: text(group, 'dimension'),
        fr: termList(terms.fr),
        en: termList(terms.en),
        covered: [...new Set(coveredWords)],
      }
    }),
    softWords: texts(criteria.soft_words),
    boolean: { fr: typeof bool.fr === 'string' ? bool.fr : '', en: typeof bool.en === 'string' ? bool.en : '' },
    phrases: { fr: termList(phrases.fr), en: termList(phrases.en) },
  }
}

export async function previewCriteria(query: string, depth: SearchMode): Promise<Criteria> {
  return parseCriteria(
    await apiRequest(`${searchAdminBase}/tools/expand`, { method: 'POST', body: { query, searchDepth: depth } }),
  )
}

export type TestHit = { lotId: string; title: string; excerpt: string; auctionDate: string | null; matchType: string; explanation: string[] }
export type TestSearch = {
  mode: string
  tookMs: number
  totalDirect: number
  totalRelated: number
  concepts: string[]
  unresolved: string[]
  direct: TestHit[]
  related: TestHit[]
}

function hit(value: unknown): TestHit {
  const fields = record(value)
  const id = fields.lot_id
  if (typeof id !== 'number' && typeof id !== 'string') throw contractError()
  return {
    lotId: String(id),
    title: text(fields, 'title'),
    excerpt: optionalText(fields, 'excerpt') ?? '',
    auctionDate: optionalText(fields, 'auction_date'),
    matchType: text(fields, 'match_type'),
    explanation: texts(fields.explanation),
  }
}

export function parseTestSearch(data: unknown): TestSearch {
  const fields = record(data)
  const understanding = isRecord(fields.understanding) ? fields.understanding : {}
  const groups = Array.isArray(understanding.concepts) ? understanding.concepts : []
  return {
    mode: text(fields, 'mode'),
    tookMs: integer(fields, 'took_ms'),
    totalDirect: integer(fields, 'total_direct'),
    totalRelated: integer(fields, 'total_related'),
    concepts: groups.flatMap((group) => (isRecord(group) ? texts(group.concepts) : [])),
    unresolved: texts(understanding.unresolved_terms),
    direct: list(fields, 'direct').map(hit),
    related: list(fields, 'related').map(hit),
  }
}

export async function testSearch(query: string, mode: SearchMode): Promise<TestSearch> {
  return parseTestSearch(
    await apiRequest(`${searchAdminBase}/tools/search`, { method: 'POST', body: { query, mode, limit: 10 } }),
  )
}

export type ExternalTest = {
  requests: { provider: string; language: string; query: string; results: number; error: string | null }[]
  direct: { provider: string; externalId: string; title: string; foundBy: string[] }[]
  related: { provider: string; externalId: string; title: string; foundBy: string[] }[]
  tookMs: number
}

function externalLot(value: unknown): ExternalTest['direct'][number] {
  const fields = record(value)
  return { provider: text(fields, 'provider'), externalId: text(fields, 'external_id'), title: text(fields, 'title'), foundBy: texts(fields.found_by) }
}

export function parseExternalTest(data: unknown): ExternalTest {
  const fields = record(data)
  return {
    requests: list(fields, 'requests').map((value) => {
      const r = record(value)
      return { provider: text(r, 'provider'), language: text(r, 'language'), query: text(r, 'query'), results: integer(r, 'results'), error: nullableText(r, 'error') }
    }),
    direct: list(fields, 'direct').map(externalLot),
    related: list(fields, 'related').map(externalLot),
    tookMs: integer(fields, 'took_ms'),
  }
}

export async function testExternal(query: string, depth: SearchMode, maxRequests: number): Promise<ExternalTest> {
  return parseExternalTest(
    await apiRequest(`${searchAdminBase}/tools/external`, {
      method: 'POST',
      body: { query, searchDepth: depth, maxRequests, limit: 10 },
    }),
  )
}

// ---- quality ---------------------------------------------------------------------------------

export type ReportInfo = { name: string; title: string; modified: number }

export async function getReports(): Promise<ReportInfo[]> {
  const data = await apiRequest(`${searchAdminBase}/reports`)
  if (!Array.isArray(data)) throw contractError()
  return data.map((value) => {
    const fields = record(value)
    return { name: text(fields, 'name'), title: text(fields, 'title'), modified: num(fields, 'modified') }
  })
}

export async function getReport(name: string): Promise<string> {
  return text(record(await apiRequest(`${searchAdminBase}/reports/${encodeURIComponent(name)}`)), 'markdown')
}

export type Metrics = { precision: number; recall: number; ndcg: number; mrr: number; meanMs: number }
export type Benchmark = { baseline: Record<string, Metrics>; latest: Record<string, Metrics>; humanLabels: number }

function metricsTable(value: unknown): Record<string, Metrics> {
  const out: Record<string, Metrics> = {}
  if (!isRecord(value)) return out
  const systems = isRecord(value.systems) ? value.systems : value
  for (const [system, raw] of Object.entries(systems)) {
    if (!isRecord(raw)) continue
    const read = (key: string): number => (typeof raw[key] === 'number' ? (raw[key] as number) : Number.NaN)
    out[system] = { precision: read('precision@10'), recall: read('recall@50'), ndcg: read('ndcg@10'), mrr: read('mrr'), meanMs: read('mean_ms') }
  }
  return out
}

export async function getBenchmark(): Promise<Benchmark> {
  const fields = record(await apiRequest(`${searchAdminBase}/benchmark`))
  return { baseline: metricsTable(fields.baseline), latest: metricsTable(fields.latest), humanLabels: integer(fields, 'humanLabels') }
}

export type SearchLog = {
  recent: { query: string; mode: string; results: number; directResults: number; tookMs: number; unresolvedTerms: string[]; createdAt: string }[]
  unresolved: { term: string; searches: number }[]
}

export async function getSearchLog(): Promise<SearchLog> {
  const fields = record(await apiRequest(`${searchAdminBase}/search-log?limit=30`))
  return {
    recent: list(fields, 'recent').map((value) => {
      const r = record(value)
      return {
        query: text(r, 'query'),
        mode: text(r, 'mode'),
        results: integer(r, 'results'),
        directResults: integer(r, 'directResults'),
        tookMs: integer(r, 'tookMs'),
        unresolvedTerms: textList(r, 'unresolvedTerms'),
        createdAt: text(r, 'createdAt'),
      }
    }),
    unresolved: list(fields, 'unresolved').map((value) => {
      const u = record(value)
      return { term: text(u, 'term'), searches: integer(u, 'searches') }
    }),
  }
}
