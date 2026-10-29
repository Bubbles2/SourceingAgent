import { useId } from 'react'
import { requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { AuctionDateStrip } from './AuctionDateStrip'
import { formatLinkHost, formatLotCount, formatSaleDateLong, formatSaleTime } from './formatAuction'
import type { SaleStatus } from './saleStatus'
import type { Auction } from './types'
import './AuctionFacts.css'

type AuctionFactsProps = {
  auction: Auction
  status: SaleStatus
}

export function AuctionFacts({ auction, status }: AuctionFactsProps): React.JSX.Element {
  const headingId = useId()

  return (
    <aside className="auction-facts" aria-labelledby={headingId}>
      <AuctionDateStrip saleDate={auction.auctionDate} />
      <div className="auction-facts__body">
        <h2 id={headingId} className="visually-hidden">
          Sale details
        </h2>
        <dl className="auction-facts__list">
          <div>
            <dt>Date</dt>
            <dd>{auction.auctionDate ? formatSaleDateLong(auction.auctionDate) : 'To be announced'}</dd>
          </div>
          {auction.startsAt ? (
            <div>
              <dt>Sale time</dt>
              <dd>{`${formatSaleTime(auction.startsAt)}, Paris time`}</dd>
            </div>
          ) : null}
          {auction.location ? (
            <div>
              <dt>Location</dt>
              <dd>{auction.location}</dd>
            </div>
          ) : null}
          <div>
            <dt>Lots</dt>
            <dd>{auction.lotCount > 0 ? formatLotCount(auction.lotCount) : 'Not yet published'}</dd>
          </div>
        </dl>
        {auction.catalogueUrl ? (
          <OutboundLink
            href={auction.catalogueUrl}
            label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`}
            context={auction.title}
          />
        ) : null}
        {status === 'upcoming' ? (
          <ButtonLink to={requestBidPath(auction.id)} size="lg" className="auction-facts__cta">
            Request a bid
          </ButtonLink>
        ) : (
          <p className="auction-facts__ended">This sale has ended.</p>
        )}
      </div>
    </aside>
  )
}
