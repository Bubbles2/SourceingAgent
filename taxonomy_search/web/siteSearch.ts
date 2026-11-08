// The site search (/search), answered by the taxonomy search service through GET /api/search.
// Results are the site's own lots (same fields as the lot lists) plus why each one matched.
import { parseLotWithAuction } from '../../src/features/lots/lotResponses'
import type { LotWithAuction } from '../../src/features/lots/types'
import { ApiError, apiRequest } from '../../src/services/apiClient'
import { boolean, integer, isRecord, list, nested, oneOf, record, text, textList } from '../../src/services/responseFields'
import { searchModes, type SearchMode } from './searchAdminApi'

export type SiteSearchHit = { lot: LotWithAuction; saleOpen: boolean; matchType: 'direct' | 'related'; reasons: string[] }

export type SiteSearchResult = {
  query: string
  mode: string
  taxonomyScope: string
  totalDirect: number
  totalRelated: number
  ideas: { text: string; labels: string[] }[]
  unresolvedTerms: string[]
  direct: SiteSearchHit[]
  related: SiteSearchHit[]
}

const assertionWords: Record<string, string> = {
  dated_to: 'period',
  in_style_of: 'style',
  made_of: 'material',
  uses_technique: 'technique',
  originates_from: 'origin',
  made_by: 'maker',
  attributed_to: 'attributed to',
  workshop_of: 'workshop of',
  circle_of: 'circle of',
  follower_of: 'follower of',
  after: 'after',
}

function readable(key: string, labels: Record<string, string>): string {
  if (labels[key]) return labels[key]
  const last = key.split('.').pop() ?? key
  return last.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/** One explanation line from the service, in words: "Louis XIV period (period) · Commodes". */
export function reasonText(line: string, labels: Record<string, string>): string | null {
  const taxonomy = /^taxonomy: (.+)$/.exec(line)
  if (taxonomy) {
    return taxonomy[1]
      .split(', ')
      .map((part) => {
        const [key, assertion] = part.split(' ')
        const word = assertionWords[assertion ?? '']
        return word ? `${readable(key, labels)} (${word})` : readable(key, labels)
      })
      .join(' · ')
  }
  const keyword = /^keyword: '(.+)'$/.exec(line)
  if (keyword) return `Text mentions “${keyword[1]}”`
  if (/^semantic similarity /.test(line)) return 'Similar description'
  const related = /^related concept (\S+) \((.+)\)$/.exec(line)
  if (related) return `Related to ${readable(related[1], labels)}`
  return null
}

function readLabels(value: unknown): Record<string, string> {
  const labels: Record<string, string> = {}
  if (isRecord(value)) {
    for (const [key, label] of Object.entries(value)) if (typeof label === 'string') labels[key] = label
  }
  return labels
}

function readHit(value: unknown, labels: Record<string, string>): SiteSearchHit {
  const fields = record(value)
  const reasons = textList(fields, 'explanation').map((line) => reasonText(line, labels)).filter((r): r is string => r !== null)
  return {
    lot: parseLotWithAuction(fields),
    saleOpen: boolean(fields, 'saleOpen'),
    matchType: oneOf(fields, 'matchType', ['direct', 'related'] as const),
    reasons: [...new Set(reasons)],
  }
}

export function parseSiteSearch(data: unknown): SiteSearchResult {
  const fields = record(data)
  const labels = readLabels(fields.labels)
  const understanding = nested(fields, 'understanding')
  return {
    query: text(fields, 'query'),
    mode: text(fields, 'mode'),
    taxonomyScope: text(fields, 'taxonomyScope'),
    totalDirect: integer(fields, 'totalDirect'),
    totalRelated: integer(fields, 'totalRelated'),
    ideas: list(understanding, 'ideas').map((value) => {
      const idea = record(value)
      return { text: text(idea, 'text'), labels: textList(idea, 'concepts').map((key) => readable(key, labels)) }
    }),
    unresolvedTerms: textList(understanding, 'unresolvedTerms'),
    direct: list(fields, 'direct').map((value) => readHit(value, labels)),
    related: list(fields, 'related').map((value) => readHit(value, labels)),
  }
}

export function readSearchMode(value: string | null): SearchMode | undefined {
  return searchModes.find((mode) => mode === value)
}

/** A search that could not be answered (service stopped, invalid query…), shown on the search page itself. */
export type SiteSearchFailure = { failed: true; message: string }
export type SiteSearchOutcome = SiteSearchResult | SiteSearchFailure

export function isFailure(outcome: SiteSearchOutcome): outcome is SiteSearchFailure {
  return 'failed' in outcome
}

export async function searchLots(query: string, mode?: SearchMode): Promise<SiteSearchOutcome> {
  const params = new URLSearchParams({ q: query })
  if (mode) params.set('mode', mode)
  try {
    return parseSiteSearch(await apiRequest(`/api/search?${params.toString()}`))
  } catch (error) {
    // Search problems stay on the search page; anything else (such as a broken response) is a real error.
    if (error instanceof ApiError && !['unauthenticated', 'forbidden', 'unexpected_response'].includes(error.code)) {
      return { failed: true, message: error.message }
    }
    throw error
  }
}
