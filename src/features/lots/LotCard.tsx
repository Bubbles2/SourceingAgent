import { CalendarDays, Gavel } from 'lucide-react'
import { Link } from 'react-router'
import { auctionPath, requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { formatLinkHost, formatSaleLine } from '../auctions/formatAuction'
import { getSaleStatus } from '../auctions/saleStatus'
import type { AuctionSummary } from '../auctions/types'
import { formatEstimate, lotCategory, lotDescription, lotName, lotTitle } from './lotText'
import type { Lot } from './types'
import './LotCard.css'

type LotCardProps = {
  lot: Lot
  auction: AuctionSummary
  /** Hide the sale, e.g. on the sale's own page */
  showAuction?: boolean
}

export function LotCard({ lot, auction, showAuction = true }: LotCardProps): React.JSX.Element {
  const titleId = `lot-${lot.id}-title`
  const title = lotTitle(lot)
  const description = lotDescription(lot)
  const category = lotCategory(lot)
  const estimate = formatEstimate(lot)
  const isUpcoming = getSaleStatus(auction.auctionDate) === 'upcoming'

  return (
    <article className="lot-card" aria-labelledby={titleId}>
      {lot.imageUrl ? (
        <img className="lot-card__image" src={lot.imageUrl} alt={title} loading="lazy" referrerPolicy="no-referrer" />
      ) : null}

      <div className="lot-card__body">
        <p className="lot-card__meta">{[lotName(lot.lotNumber), category].filter(Boolean).join(' · ')}</p>
        <h3 id={titleId} className="lot-card__title">
          {title}
        </h3>
        {lot.maker || estimate ? (
          <dl className="lot-card__details">
            {lot.maker ? (
              <div>
                <dt>Maker</dt>
                <dd>{lot.maker}</dd>
              </div>
            ) : null}
            {estimate ? (
              <div>
                <dt>Estimate</dt>
                <dd>{estimate}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {showAuction ? (
          <ul className="lot-card__facts">
            <li>
              <Gavel size={16} />
              <span>
                <span className="visually-hidden">Auction: </span>
                <Link to={auctionPath(auction.id)}>{auction.title}</Link>
              </span>
            </li>
            <li>
              <CalendarDays size={16} />
              <span>
                <span className="visually-hidden">Sale: </span>
                {formatSaleLine(auction)}
              </span>
            </li>
          </ul>
        ) : null}
        {description && description !== title ? <p className="lot-card__description">{description}</p> : null}
      </div>

      <div className="lot-card__foot">
        {lot.sourceUrl ? (
          <OutboundLink href={lot.sourceUrl} label={`View on ${formatLinkHost(lot.sourceUrl)}`} context={lotName(lot.lotNumber)} />
        ) : (
          <span />
        )}
        {isUpcoming ? (
          <ButtonLink
            className="lot-card__action"
            to={requestBidPath(auction.id, lot.id)}
            aria-label={`Request a bid: ${lotName(lot.lotNumber)}, ${title}`}
          >
            Request a bid
          </ButtonLink>
        ) : (
          <span className="lot-card__ended">Sale ended</span>
        )}
      </div>
    </article>
  )
}
