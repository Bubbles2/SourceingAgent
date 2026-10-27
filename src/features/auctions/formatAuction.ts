import type { Auction } from './types'

// Dates are calendar days, so format in UTC to avoid shifting them by the viewer's time zone.
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'UTC' })
const dayNumberFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const monthYearFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
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

/** "12–13 Nov", or "30 Nov – 1 Dec" across months */
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

/** "212 lots · Sale at 14:00 · Viewing 12–13 Nov" */
export function formatAuctionMeta(auction: Auction): string {
  const lots = `${countFormatter.format(auction.lotCount)} ${auction.lotCount === 1 ? 'lot' : 'lots'}`
  return `${lots} · Sale at ${auction.saleTime} · Viewing ${formatViewingRange(auction.viewing)}`
}
