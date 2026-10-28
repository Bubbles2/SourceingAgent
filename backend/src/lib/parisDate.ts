// Calendar dates in Paris, where every sale takes place, as ISO strings (YYYY-MM-DD).

// en-CA formats dates as YYYY-MM-DD, which compare correctly as strings.
const parisDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayInParis(now: Date = new Date()): string {
  return parisDateFormatter.format(now)
}

/** The same calendar day a number of years later (29 February becomes 1 March). */
export function addYears(isoDate: string, years: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return date.toISOString().slice(0, 10)
}
