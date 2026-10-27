export type SaleStatus = 'upcoming' | 'completed'

export const saleStatusOptions: readonly { value: SaleStatus; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
]

// en-CA formats dates as YYYY-MM-DD, which compares directly with the ISO sale dates.
const parisDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayInParis(): string {
  return parisDateFormatter.format(new Date())
}

/** A sale stays upcoming until the end of its sale day in Paris. */
export function getSaleStatus(saleDate: string, today: string = todayInParis()): SaleStatus {
  return saleDate >= today ? 'upcoming' : 'completed'
}

/** Reads the `status` search param, defaulting to upcoming sales. */
export function parseSaleStatus(value: string | null): SaleStatus {
  return value === 'completed' ? 'completed' : 'upcoming'
}
