// SQL for sale dates, which the website shows in Paris time whatever the server's time zone.
// Each expression reads the auctions table under the alias `a`.

export const parisSaleDate = "to_char(a.starts_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')"
export const parisSaleTime = "to_char(a.starts_at AT TIME ZONE 'Europe/Paris', 'HH24:MI')"

/** Midnight in Paris at the start of a date, as a timestamptz. `date` is SQL, such as '$1::date'. */
export function parisMidnight(date: string): string {
  return `((${date})::timestamp AT TIME ZONE 'Europe/Paris')`
}

/**
 * A sale is upcoming, and takes bid requests, until the end of its sale day in Paris. Written as a
 * range on starts_at so it can use the column's indexes.
 */
export const saleIsOpen = `a.starts_at >= ${parisMidnight("(now() AT TIME ZONE 'Europe/Paris')::date")}`
