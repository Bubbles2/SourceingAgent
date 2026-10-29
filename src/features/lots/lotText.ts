// How lots read on the site: in English when the monitor has translated them, otherwise as the
// auction house published them.
import type { Lot, LotSummary } from './types'

const optionTitleLength = 80

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "Lot 302" */
export function lotName(lotNumber: string | null): string {
  return lotNumber ? `Lot ${lotNumber}` : 'Unnumbered lot'
}

/**
 * The English title, or else the published one without the lot number it often starts with
 * ("302 - Buda sentado de bronce" reads "Buda sentado de bronce").
 */
export function lotTitle({ lotNumber, title, titleUk }: Pick<Lot, 'lotNumber' | 'title' | 'titleUk'>): string {
  const english = titleUk?.trim()
  if (english) {
    return english
  }
  const published = title?.trim() ?? ''
  const withoutNumber = lotNumber ? published.replace(new RegExp(`^${escapeRegExp(lotNumber)}\\s*[-–—]\\s*`), '') : published
  return withoutNumber || 'Untitled lot'
}

/** The English description, or else the published one */
export function lotDescription({ description, descriptionUk }: Pick<Lot, 'description' | 'descriptionUk'>): string | null {
  return descriptionUk?.trim() || description?.trim() || null
}

/** The English category, or else the published one */
export function lotCategory({ category, aiCategory }: Pick<Lot, 'category' | 'aiCategory'>): string | null {
  return aiCategory?.trim() || category?.trim() || null
}

/** "€1,500–€2,000", "From €1,500" or "Up to €2,000"; null without an estimate */
export function formatEstimate({ estimateLow, estimateHigh, currency }: Pick<Lot, 'estimateLow' | 'estimateHigh' | 'currency'>): string | null {
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency ?? 'EUR', maximumFractionDigits: 0 })
  if (estimateLow !== null && estimateHigh !== null) {
    return estimateLow === estimateHigh
      ? formatter.format(estimateLow)
      : `${formatter.format(estimateLow)}–${formatter.format(estimateHigh)}`
  }
  if (estimateLow !== null) {
    return `From ${formatter.format(estimateLow)}`
  }
  return estimateHigh === null ? null : `Up to ${formatter.format(estimateHigh)}`
}

/** "302 · Bronze Seated Buddha", kept short enough for a list of choices */
export function lotOptionLabel(lot: LotSummary): string {
  const title = lotTitle(lot)
  const shortTitle = title.length > optionTitleLength ? `${title.slice(0, optionTitleLength - 1).trimEnd()}…` : title
  return lot.lotNumber ? `${lot.lotNumber} · ${shortTitle}` : shortTitle
}
