import { formatSaleDateLong, formatSaleTime } from '../auctions/formatAuction'
import type { Auction } from '../auctions/types'
import { formatDayAndMonth, getMonthWeeks, weekdays, type CalendarDay, type MonthKey } from './calendarDates'
import './Calendar.css'

type MonthGridProps = {
  month: MonthKey
  auctionsByDate: ReadonlyMap<string, readonly Auction[]>
  /** ISO date of today in Paris */
  today: string
  labelledBy: string
  onSelectAuction?: (auctionId: string) => void
}

/** Desktop and tablet month view (DESIGN.md §6.10). Below 640 px MonthAgenda takes over. */
export function MonthGrid({
  month,
  auctionsByDate,
  today,
  labelledBy,
  onSelectAuction,
}: MonthGridProps): React.JSX.Element {
  return (
    <table className="cal" aria-labelledby={labelledBy}>
      <thead>
        <tr>
          {weekdays.map((weekday) => (
            <th key={weekday.short} scope="col">
              <span aria-hidden="true">{weekday.short}</span>
              <span className="visually-hidden">{weekday.long}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {getMonthWeeks(month).map((week) => (
          <tr key={week[0].date}>
            {week.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                isToday={day.date === today}
                auctions={auctionsByDate.get(day.date) ?? []}
                onSelectAuction={onSelectAuction}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type DayCellProps = {
  day: CalendarDay
  isToday: boolean
  auctions: readonly Auction[]
  onSelectAuction?: (auctionId: string) => void
}

function DayCell({ day, isToday, auctions, onSelectAuction }: DayCellProps): React.JSX.Element {
  const className = [
    'cal__cell',
    day.isWeekend && 'cal__cell--weekend',
    !day.inMonth && 'cal__cell--outside',
    isToday && 'cal__cell--today',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <td className={className} aria-current={isToday ? 'date' : undefined}>
      <div className="cal__day-head">
        <time className="cal__num" dateTime={day.date}>
          {day.dayOfMonth === 1 ? formatDayAndMonth(day.date) : day.dayOfMonth}
        </time>
        {isToday ? <span className="visually-hidden">, today</span> : null}
      </div>
      {auctions.length > 0 ? (
        <ul className="cal__events">
          {auctions.map((auction) => (
            <li key={auction.id}>
              <GridEventButton auction={auction} onSelect={onSelectAuction} />
            </li>
          ))}
        </ul>
      ) : null}
    </td>
  )
}

type GridEventButtonProps = {
  auction: Auction
  onSelect?: (auctionId: string) => void
}

function GridEventButton({ auction, onSelect }: GridEventButtonProps): React.JSX.Element {
  function handleClick(): void {
    onSelect?.(auction.id)
  }

  return (
    <button type="button" className="cal__event" aria-haspopup="dialog" title={auction.title} onClick={handleClick}>
      {auction.startsAt ? <span className="cal__event-time">{formatSaleTime(auction.startsAt)}</span> : null} {auction.title}
      {auction.auctionDate ? <span className="visually-hidden">{`, ${formatSaleDateLong(auction.auctionDate)}`}</span> : null}
    </button>
  )
}
