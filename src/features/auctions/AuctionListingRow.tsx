import { Link } from 'react-router'
import { auctionPath } from '../../app/paths'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { formatAuctionMeta, formatLinkHost, formatSaleDateShort } from './formatAuction'
import type { Auction } from './types'

export function AuctionListingRow({ auction }: { auction: Auction }): React.JSX.Element {
  return (
    <article className="auction-list__row">
      <time className="auction-list__date" dateTime={auction.auctionDate ?? undefined}>
        {auction.auctionDate ? formatSaleDateShort(auction.auctionDate) : 'Date to be announced'}
      </time>
      <div className="auction-list__description">
        <h3><Link to={auctionPath(auction.id)}>{auction.title}</Link></h3>
        <p>{[auction.location, formatAuctionMeta(auction)].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="auction-list__actions">
        {auction.catalogueUrl ? (
          <OutboundLink href={auction.catalogueUrl} label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`} context={auction.title} />
        ) : null}
        <Link className="auction-list__details" to={auctionPath(auction.id)} aria-label={`View details: ${auction.title}`}>
          View details
        </Link>
      </div>
    </article>
  )
}
