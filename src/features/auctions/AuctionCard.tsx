import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { AuctionDateStrip } from './AuctionDateStrip'
import { formatAuctionMeta } from './formatAuction'
import type { Auction } from './types'
import './AuctionCard.css'

type AuctionCardProps = {
  auction: Auction
  showDescription?: boolean
  /** Footer buttons; give the primary one the `auction-card__action` class */
  actions: ReactNode
}

export function AuctionCard({ auction, showDescription = false, actions }: AuctionCardProps): React.JSX.Element {
  const titleId = `auction-${auction.id}-title`

  return (
    <article className="auction-card" aria-labelledby={titleId}>
      <AuctionDateStrip saleDate={auction.saleDate} category={auction.category} />
      {auction.image ? (
        <img className="auction-card__image" src={auction.image.src} alt={auction.image.alt} loading="lazy" />
      ) : null}

      <div className="auction-card__body">
        <h3 id={titleId} className="auction-card__title">
          {auction.title}
        </h3>
        <p className="auction-card__house">
          <MapPin size={16} />
          {`${auction.house} · ${auction.city}`}
        </p>
        <p className="auction-card__meta">{formatAuctionMeta(auction)}</p>
        {showDescription ? <p className="auction-card__description">{auction.description}</p> : null}
      </div>

      <div className="auction-card__foot">{actions}</div>
    </article>
  )
}
