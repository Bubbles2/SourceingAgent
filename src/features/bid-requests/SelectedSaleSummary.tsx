import { useId } from 'react'
import { CalendarDays, Gavel, MapPin } from 'lucide-react'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { AuctionDateStrip } from '../auctions/AuctionDateStrip'
import { formatLinkHost, formatLotCount, formatSaleMoment } from '../auctions/formatAuction'
import type { Auction } from '../auctions/types'
import { lotName, lotTitle } from '../lots/lotText'
import type { LotSummary } from '../lots/types'
import './BidRequestForm.css'

type SelectedSaleSummaryProps = {
  auction: Auction | undefined
  lot: LotSummary | undefined
}

/** Context beside the form: the chosen sale and lot, or how requests work before a choice. */
export function SelectedSaleSummary({ auction, lot }: SelectedSaleSummaryProps): React.JSX.Element {
  const titleId = useId()

  if (!auction) {
    return (
      <aside className="sale-summary" aria-labelledby={titleId}>
        <div className="sale-summary__body">
          <h2 id={titleId} className="sale-summary__title">
            How requests work
          </h2>
          <ol className="sale-summary__steps">
            <li>Choose the sale, then the lot you want.</li>
            <li>Enter the most you are willing to pay at the hammer.</li>
            <li>The agent reviews your request. Once accepted, the lot is reserved for you and the agent bids in the saleroom.</li>
          </ol>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sale-summary" aria-labelledby={titleId}>
      <AuctionDateStrip saleDate={auction.auctionDate} />
      <div className="sale-summary__body">
        <h2 id={titleId} className="sale-summary__title">
          {auction.title}
        </h2>
        <ul className="sale-summary__facts">
          {auction.location ? (
            <li>
              <MapPin size={16} />
              {auction.location}
            </li>
          ) : null}
          <li>
            <CalendarDays size={16} />
            {formatSaleMoment(auction)}
          </li>
          {auction.lotCount > 0 ? (
            <li>
              <Gavel size={16} />
              {formatLotCount(auction.lotCount)}
            </li>
          ) : null}
        </ul>
        {auction.catalogueUrl ? (
          <OutboundLink
            href={auction.catalogueUrl}
            label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`}
            context={auction.title}
          />
        ) : null}
        {lot ? (
          <div className="sale-summary__lot">
            <p className="sale-summary__lot-number">{lotName(lot.lotNumber)}</p>
            <p className="sale-summary__lot-title">{lotTitle(lot)}</p>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
