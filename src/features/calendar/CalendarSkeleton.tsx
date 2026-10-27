import { LoadingRegion } from '../../components/ui/LoadingRegion'
import { todayInParis } from '../auctions/saleStatus'
import type { Auction } from '../auctions/types'
import { formatMonthTitle, type MonthKey } from './calendarDates'
import { MonthGrid } from './MonthGrid'
import './Calendar.css'

const noAuctions: ReadonlyMap<string, readonly Auction[]> = new Map()

type CalendarSkeletonProps = {
  month: MonthKey
  labelledBy: string
}

/** The empty month grid (so nothing shifts when sales arrive), plus agenda placeholders on mobile. */
export function CalendarSkeleton({ month, labelledBy }: CalendarSkeletonProps): React.JSX.Element {
  return (
    <LoadingRegion label={`Loading auctions for ${formatMonthTitle(month)}`}>
      <MonthGrid month={month} auctionsByDate={noAuctions} today={todayInParis()} labelledBy={labelledBy} />
      <div className="cal-agenda cal-agenda--skeleton">
        <span className="skeleton skeleton--short" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    </LoadingRegion>
  )
}
