import { Badge } from '../../components/ui/Badge'
import { formatSaleDay, formatSaleMonth } from './formatAuction'
import './AuctionDateStrip.css'

type AuctionDateStripProps = {
  /** Null when the auction house hasn't published the date */
  saleDate: string | null
  /** Shown as the badge, when there is one */
  label?: string | null
}

/** Navy strip with the sale date and an optional badge (DESIGN.md §6.3); also the fallback visual when no photo exists. */
export function AuctionDateStrip({ saleDate, label }: AuctionDateStripProps): React.JSX.Element {
  return (
    <div className="date-strip">
      {saleDate ? (
        <time className="date-strip__date" dateTime={saleDate}>
          <span className="date-strip__day">{formatSaleDay(saleDate)}</span>
          <span className="date-strip__month">{formatSaleMonth(saleDate)}</span>
        </time>
      ) : (
        <span className="date-strip__date">
          <span className="date-strip__month">Date to be announced</span>
        </span>
      )}
      {label ? <Badge>{label}</Badge> : null}
    </div>
  )
}
