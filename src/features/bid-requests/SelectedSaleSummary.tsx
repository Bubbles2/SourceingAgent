import { useId } from 'react'
import { CalendarDays, Eye, MapPin } from 'lucide-react'
import { AuctionDateStrip } from '../auctions/AuctionDateStrip'
import { formatCatalogueMeta, formatSaleDateLong, formatViewingRange } from '../auctions/formatAuction'
import type { Auction, Catalogue } from '../auctions/types'
import { PdfLink } from '../catalogues/PdfLink'
import './BidRequestForm.css'

type SelectedSaleSummaryProps = {
  auction: Auction | undefined
  catalogue: Catalogue | undefined
}

/** Context beside the form: the chosen sale and catalogue, or how requests work before a choice. */
export function SelectedSaleSummary({ auction, catalogue }: SelectedSaleSummaryProps): React.JSX.Element {
  const titleId = useId()

  if (!auction) {
    return (
      <aside className="sale-summary" aria-labelledby={titleId}>
        <div className="sale-summary__body">
          <h2 id={titleId} className="sale-summary__title">
            How requests work
          </h2>
          <ol className="sale-summary__steps">
            <li>Choose the sale and the catalogue that lists your lot.</li>
            <li>Enter the lot number and the most you are willing to pay at the hammer.</li>
            <li>The agent reviews your request. Once accepted, the lot is reserved for you and the agent bids in the saleroom.</li>
          </ol>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sale-summary" aria-labelledby={titleId}>
      <AuctionDateStrip saleDate={auction.saleDate} category={auction.category} />
      <div className="sale-summary__body">
        <h2 id={titleId} className="sale-summary__title">
          {auction.title}
        </h2>
        <ul className="sale-summary__facts">
          <li>
            <MapPin size={16} />
            {`${auction.house} · ${auction.city}`}
          </li>
          <li>
            <CalendarDays size={16} />
            {`${formatSaleDateLong(auction.saleDate)} at ${auction.saleTime}`}
          </li>
          {auction.viewing ? (
            <li>
              <Eye size={16} />
              {`Viewing ${formatViewingRange(auction.viewing)}`}
            </li>
          ) : null}
        </ul>
        {catalogue ? (
          <div className="sale-summary__catalogue">
            <p className="sale-summary__catalogue-meta">{formatCatalogueMeta(catalogue)}</p>
            <p className="sale-summary__catalogue-title">{catalogue.title}</p>
            <PdfLink href={catalogue.pdfUrl} label="Open the catalogue PDF" context={catalogue.title} />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
