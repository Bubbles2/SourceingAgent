// SQL for sale dates, which the website shows in Paris time whatever the server's time zone.
// Each expression reads the auctions table under the alias `a`.

/** Midnight in Paris at the start of a date, as a timestamptz. `date` is SQL, such as '$1::date'. */
export function parisMidnight(date: string): string {
  return `((${date})::timestamp AT TIME ZONE 'Europe/Paris')`
}

/**
 * When the sale starts: its start time, or midnight in Paris on its sale day when the monitor only
 * found the day. NULL when it found neither.
 */
export const saleStartsAt = `coalesce(a.starts_at, ${parisMidnight('a.auction_date')})`

/** The sale day in Paris, YYYY-MM-DD */
export const parisSaleDate = `to_char(${saleStartsAt} AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')`

/**
 * A sale is upcoming, and takes bid requests, until the end of its sale day in Paris. A sale with no
 * date at all counts as closed, since nobody could say when to bid.
 */
export const saleIsOpen = `coalesce(${saleStartsAt} >= ${parisMidnight("(now() AT TIME ZONE 'Europe/Paris')::date")}, false)`

/** The sale has begun, so a result can be recorded. False for a sale with no date. */
export const saleHasStarted = `coalesce(${saleStartsAt} <= now(), false)`
