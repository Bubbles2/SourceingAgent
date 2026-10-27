import type { Auction, Catalogue } from './types'

// Dates are calendar days, so format in UTC to avoid shifting them by the viewer's time zone.
// Month and weekday names come from en-US so September stays "Sep" (en-GB writes "Sept").
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'UTC' })
const dayNumberFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const monthYearFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const frenchDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const countFormatter = new Intl.NumberFormat('en-GB')

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`)
}

/** "14" */
export function formatSaleDay(isoDate: string): string {
  return dayFormatter.format(parseIsoDate(isoDate))
}

/** "Nov 2026" */
export function formatSaleMonth(isoDate: string): string {
  return monthYearFormatter.format(parseIsoDate(isoDate))
}

/** "Sat 14 Nov 2026" */
export function formatSaleDateShort(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  return `${weekdayFormatter.format(date)} ${dayNumberFormatter.format(date)} ${monthFormatter.format(date)} ${date.getUTCFullYear()}`
}

/** "14 Nov 2026" */
export function formatDayMonthYear(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  return `${dayNumberFormatter.format(date)} ${monthFormatter.format(date)} ${date.getUTCFullYear()}`
}

/** "Saturday, 14 November 2026" */
export function formatSaleDateLong(isoDate: string): string {
  return longDateFormatter.format(parseIsoDate(isoDate))
}

/** "14 novembre 2026", as printed on French catalogue covers */
export function formatSaleDateFrench(isoDate: string): string {
  return frenchDateFormatter.format(parseIsoDate(isoDate))
}

/** "12–13 Nov", or "30 Sep – 1 Oct" across months */
export function formatViewingRange({ start, end }: Auction['viewing']): string {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  const startDay = dayNumberFormatter.format(startDate)
  const endDay = dayNumberFormatter.format(endDate)
  const startMonth = monthFormatter.format(startDate)
  const endMonth = monthFormatter.format(endDate)

  if (start === end) {
    return `${startDay} ${startMonth}`
  }
  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${endMonth}`
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`
}

/** "212 lots" */
export function formatLotCount(lotCount: number): string {
  return `${countFormatter.format(lotCount)} ${lotCount === 1 ? 'lot' : 'lots'}`
}

/** "212 lots · Sale at 14:00 · Viewing 12–13 Nov" */
export function formatAuctionMeta(auction: Auction): string {
  return `${formatLotCount(auction.lotCount)} · Sale at ${auction.saleTime} · Viewing ${formatViewingRange(auction.viewing)}`
}

/** "Lots 1–212 · 168 pages" */
export function formatCatalogueMeta({ lots, pageCount }: Pick<Catalogue, 'lots' | 'pageCount'>): string {
  return `Lots ${lots.first}–${lots.last} · ${countFormatter.format(pageCount)} pages`
}
