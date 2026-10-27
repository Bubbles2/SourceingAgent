import { Badge } from '../../components/ui/Badge'
import { formatSaleDay, formatSaleMonth } from './formatAuction'
import './AuctionDateStrip.css'

type AuctionDateStripProps = {
  saleDate: string
  category: string
}

/** Navy strip with the sale date and category badge (DESIGN.md §6.3); also the fallback visual when no photo exists. */
export function AuctionDateStrip({ saleDate, category }: AuctionDateStripProps): React.JSX.Element {
  return (
    <div className="date-strip">
      <time className="date-strip__date" dateTime={saleDate}>
        <span className="date-strip__day">{formatSaleDay(saleDate)}</span>
        <span className="date-strip__month">{formatSaleMonth(saleDate)}</span>
      </time>
      <Badge>{category}</Badge>
    </div>
  )
}
