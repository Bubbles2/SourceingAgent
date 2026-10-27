import { useId } from 'react'
import { requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { AuctionDateStrip } from './AuctionDateStrip'
import { formatLotCount, formatSaleDateLong, formatViewingRange } from './formatAuction'
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
      <AuctionDateStrip saleDate={auction.saleDate} category={auction.category} />
      <div className="auction-facts__body">
        <h2 id={headingId} className="visually-hidden">
          Sale details
        </h2>
        <dl className="auction-facts__list">
          <div>
            <dt>Date</dt>
            <dd>{formatSaleDateLong(auction.saleDate)}</dd>
          </div>
          <div>
            <dt>Sale time</dt>
            <dd>{`${auction.saleTime}, Paris time`}</dd>
          </div>
          <div>
            <dt>Viewing</dt>
            <dd>{formatViewingRange(auction.viewing)}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>
              {auction.house}
              <br />
              {auction.city}
            </dd>
          </div>
          <div>
            <dt>Lots</dt>
            <dd>{formatLotCount(auction.lotCount)}</dd>
          </div>
        </dl>
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
