import { formatSaleDateShort } from '../auctions/formatAuction'
import type { Auction } from '../auctions/types'
import { formatMonthTitle, type MonthKey } from './calendarDates'
import './Calendar.css'

type MonthAgendaProps = {
  month: MonthKey
  auctionsByDate: ReadonlyMap<string, readonly Auction[]>
  /** ISO date of today in Paris */
  today: string
  onSelectAuction: (auctionId: string) => void
}

/** Mobile list of the month's sale days, shown below 640 px instead of the grid (DESIGN.md §5). */
export function MonthAgenda({ month, auctionsByDate, today, onSelectAuction }: MonthAgendaProps): React.JSX.Element | null {
  const days = [...auctionsByDate].filter(([date]) => date.startsWith(month))

  if (days.length === 0) {
    return null
  }

  return (
    <ol className="cal-agenda" aria-label={`Auctions in ${formatMonthTitle(month)}`}>
      {days.map(([date, auctions]) => (
        <li key={date} className="cal-agenda__day" aria-current={date === today ? 'date' : undefined}>
          <h3 className="cal-agenda__date">
            <time dateTime={date}>{formatSaleDateShort(date)}</time>
            {date === today ? ' · Today' : null}
          </h3>
          <ul className="cal-agenda__events">
            {auctions.map((auction) => (
              <li key={auction.id}>
                <AgendaEventButton auction={auction} onSelect={onSelectAuction} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

type AgendaEventButtonProps = {
  auction: Auction
  onSelect: (auctionId: string) => void
}

function AgendaEventButton({ auction, onSelect }: AgendaEventButtonProps): React.JSX.Element {
  function handleClick(): void {
    onSelect(auction.id)
  }

  return (
    <button type="button" className="cal-agenda__event" aria-haspopup="dialog" onClick={handleClick}>
      <span className="cal-agenda__meta">{`${auction.saleTime} · ${auction.category}`}</span>
      <span className="cal-agenda__title">{auction.title}</span>
      <span className="cal-agenda__house">{`${auction.house} · ${auction.city}`}</span>
    </button>
  )
}
