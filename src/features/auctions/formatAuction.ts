import type { Auction, AuctionSummary } from './types'

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
// Sale times are instants, shown as the clock reads in Paris
const parisTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Paris',
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

/** "14:00", Paris time, for an ISO date-time */
export function formatSaleTime(startsAt: string): string {
  return parisTimeFormatter.format(new Date(startsAt))
}

/** "Saturday, 14 November 2026 at 14:00", leaving out what the auction house hasn't published */
export function formatSaleMoment({ auctionDate, startsAt }: Pick<AuctionSummary, 'auctionDate' | 'startsAt'>): string {
  if (!auctionDate) {
    return 'Date to be announced'
  }
  const date = formatSaleDateLong(auctionDate)
  return startsAt ? `${date} at ${formatSaleTime(startsAt)}` : date
}

/** "Sat 14 Nov 2026 · Paris 9e", leaving out what isn't known */
export function formatSaleLine({ auctionDate, location }: Pick<AuctionSummary, 'auctionDate' | 'location'>): string {
  return [auctionDate ? formatSaleDateShort(auctionDate) : 'Date to be announced', location].filter(Boolean).join(' · ')
}

/** "212 lots" */
export function formatLotCount(lotCount: number): string {
  return `${countFormatter.format(lotCount)} ${lotCount === 1 ? 'lot' : 'lots'}`
}

/** "212 lots · Sale at 14:00", leaving out what isn't known yet */
export function formatAuctionMeta({ lotCount, startsAt }: Pick<Auction, 'lotCount' | 'startsAt'>): string {
  return [lotCount > 0 ? formatLotCount(lotCount) : 'Lots not yet published', startsAt ? `Sale at ${formatSaleTime(startsAt)}` : null]
    .filter((part) => part !== null)
    .join(' · ')
}

/** "drouot.com", to name the website a link leads to */
export function formatLinkHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}
