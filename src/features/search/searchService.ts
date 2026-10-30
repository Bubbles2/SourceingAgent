import { apiRequest } from '../../services/apiClient'

export type SearchResult = {
  title: string
  description: string | null
  date: string | null
  estimate: string | null
  sourceUrl: string | null
  lotNumber: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-GB') : null
}

export async function searchLots(query: string): Promise<SearchResult[]> {
  const data = record(await apiRequest(`/api/search?q=${encodeURIComponent(query)}`))
  if (!data || !Array.isArray(data.results)) throw new Error('The search response was not valid.')
  return data.results.map((value: unknown) => {
    const fields = record(value)
    if (!fields) throw new Error('The search response was not valid.')
    const low = amount(fields.estimate_low)
    const high = amount(fields.estimate_high)
    const currency = optionalText(fields.currency) ?? 'EUR'
    const estimate = low && high ? `${low}–${high} ${currency}` : low || high ? `${low ?? high} ${currency}` : null
    return {
      title: optionalText(fields.titleuk) ?? optionalText(fields.title) ?? 'Untitled lot',
      description: optionalText(fields.descriptionuk) ?? optionalText(fields.description),
      date: optionalText(fields.auction_date),
      estimate,
      sourceUrl: optionalText(fields.source_url),
      lotNumber: fields.lot_number == null ? null : String(fields.lot_number),
    }
  })
}
