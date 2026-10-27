// Month-grid date maths. Sale dates are calendar days (YYYY-MM-DD), so everything runs in UTC:
// no time zone or daylight-saving change can shift a day.
import { todayInParis } from '../auctions/saleStatus'

/** "YYYY-MM" */
export type MonthKey = string

export type CalendarDay = {
  /** ISO date (YYYY-MM-DD) */
  date: string
  dayOfMonth: number
  inMonth: boolean
  isWeekend: boolean
}

export const weekdays = [
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
  { short: 'Sun', long: 'Sunday' },
] as const

const monthKeyPattern = /^(\d{4})-(0[1-9]|1[0-2])$/
const monthTitleFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`)
}

function firstOfMonth(month: MonthKey): Date {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, 1))
}

/** 0 for Monday through 6 for Sunday */
function mondayBasedWeekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

export function currentMonthKey(): MonthKey {
  return todayInParis().slice(0, 7)
}

/** Reads the `month` search param; anything malformed falls back to the current month. */
export function parseMonthKey(value: string | null): MonthKey {
  return value && monthKeyPattern.test(value) ? value : currentMonthKey()
}

export function addMonths(month: MonthKey, months: number): MonthKey {
  const date = firstOfMonth(month)
  // Day 1 exists in every month, so moving the month can never overflow into the next one.
  date.setUTCMonth(date.getUTCMonth() + months)
  return toIsoDate(date).slice(0, 7)
}

/** Monday-to-Sunday weeks covering the month, padded with days from the neighbouring months. */
export function getMonthWeeks(month: MonthKey): CalendarDay[][] {
  const first = firstOfMonth(month)
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
  const gridStart = addDays(toIsoDate(first), -mondayBasedWeekday(first))
  const gridEnd = addDays(toIsoDate(last), 6 - mondayBasedWeekday(last))

  const weeks: CalendarDay[][] = []
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    const weekdayIndex = mondayBasedWeekday(parseIsoDate(date))
    if (weekdayIndex === 0) {
      weeks.push([])
    }
    weeks[weeks.length - 1].push({
      date,
      dayOfMonth: Number(date.slice(8)),
      inMonth: date.startsWith(month),
      isWeekend: weekdayIndex >= 5,
    })
  }
  return weeks
}

/** First and last ISO dates shown in the month grid */
export function getMonthGridRange(month: MonthKey): { from: string; to: string } {
  const weeks = getMonthWeeks(month)
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date }
}

/** "November 2026" */
export function formatMonthTitle(month: MonthKey): string {
  return monthTitleFormatter.format(firstOfMonth(month))
}

/** "1 Dec" — labels the first day of a neighbouring month in the grid */
export function formatDayAndMonth(isoDate: string): string {
  return `${Number(isoDate.slice(8))} ${shortMonthFormatter.format(parseIsoDate(isoDate))}`
}

export function groupBySaleDate<T extends { saleDate: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    groups.set(item.saleDate, [...(groups.get(item.saleDate) ?? []), item])
  }
  return groups
}
