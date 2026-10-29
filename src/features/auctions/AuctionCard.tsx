import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { AuctionDateStrip } from './AuctionDateStrip'
import { formatAuctionMeta } from './formatAuction'
import type { Auction } from './types'
import './AuctionCard.css'

type AuctionCardProps = {
  auction: Auction
  /** Footer buttons; give the primary one the `auction-card__action` class */
  actions: ReactNode
}

export function AuctionCard({ auction, actions }: AuctionCardProps): React.JSX.Element {
  const titleId = `auction-${auction.id}-title`

  return (
    <article className="auction-card" aria-labelledby={titleId}>
      <AuctionDateStrip saleDate={auction.auctionDate} />

      <div className="auction-card__body">
        <h3 id={titleId} className="auction-card__title">
          {auction.title}
        </h3>
        {auction.location ? (
          <p className="auction-card__house">
            <MapPin size={16} />
            {auction.location}
          </p>
        ) : null}
        <p className="auction-card__meta">{formatAuctionMeta(auction)}</p>
      </div>

      <div className="auction-card__foot">{actions}</div>
    </article>
  )
}
