import { FileIcon, MapPin } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { ButtonLink } from '../../components/ui/Button'
import { paths } from '../../app/paths'
import { formatAuctionMeta, formatSaleDay, formatSaleMonth } from './formatAuction'
import type { Auction } from './types'
import './AuctionCard.css'

type AuctionCardProps = {
  auction: Auction
}

export function AuctionCard({ auction }: AuctionCardProps): React.JSX.Element {
  const titleId = `auction-${auction.id}-title`

  return (
    <article className="auction-card" aria-labelledby={titleId}>
      <div className="auction-card__head">
        <time className="auction-card__date" dateTime={auction.saleDate}>
          <span className="auction-card__day">{formatSaleDay(auction.saleDate)}</span>
          <span className="auction-card__month">{formatSaleMonth(auction.saleDate)}</span>
        </time>
        <Badge>{auction.category}</Badge>
      </div>

      <div className="auction-card__body">
        <h3 id={titleId} className="auction-card__title">
          {auction.title}
        </h3>
        <p className="auction-card__house">
          <MapPin size={16} />
          {`${auction.house} · ${auction.city}`}
        </p>
        <p className="auction-card__meta">{formatAuctionMeta(auction)}</p>
      </div>

      <div className="auction-card__foot">
        <ButtonLink
          variant="link"
          href={auction.catalogueUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Catalogue (PDF) for ${auction.title}, opens in a new tab`}
        >
          <FileIcon size={16} />
          Catalogue (PDF)
        </ButtonLink>
        <ButtonLink
          className="auction-card__request"
          to={{ pathname: paths.requestBid, search: `?auction=${auction.id}` }}
          aria-label={`Request a bid: ${auction.title}`}
        >
          Request a bid
        </ButtonLink>
      </div>
    </article>
  )
}
