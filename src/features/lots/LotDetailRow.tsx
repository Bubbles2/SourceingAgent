import { useState } from 'react'
import { Link } from 'react-router'
import { auctionPath, requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { formatLinkHost, formatSaleLine } from '../auctions/formatAuction'
import { getSaleStatus } from '../auctions/saleStatus'
import { formatEstimate, lotCategory, lotDescription, lotName, lotTitle } from './lotText'
import type { LotWithAuction } from './types'
import './LotDetailRow.css'

export function LotDetailRow({ lot, showAuction }: { lot: LotWithAuction; showAuction: boolean }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const title = lotTitle(lot)
  const description = lotDescription(lot)
  const estimate = formatEstimate(lot)
  const upcoming = getSaleStatus(lot.auction.auctionDate) === 'upcoming'

  return (
    <article className="lot-detail-row">
      {lot.imageUrl ? <img className="lot-detail-row__image" src={lot.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
      <div className="lot-detail-row__content">
        <p className="lot-detail-row__meta">{[lotName(lot.lotNumber), lotCategory(lot)].filter(Boolean).join(' · ')}</p>
        <h3 className="lot-detail-row__title">{title}</h3>
        <p className="lot-detail-row__facts">
          {[lot.maker, estimate, showAuction ? formatSaleLine(lot.auction) : null].filter(Boolean).join(' · ')}
          {showAuction ? <> · <Link to={auctionPath(lot.auction.id)}>{lot.auction.title}</Link></> : null}
        </p>
        {description && description !== title ? (
          <div>
            <p id={`lot-description-${lot.id}`} className={`lot-detail-row__description${expanded ? ' lot-detail-row__description--expanded' : ''}`}>{description}</p>
            <button className="lot-detail-row__more" type="button" aria-expanded={expanded} aria-controls={`lot-description-${lot.id}`} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="lot-detail-row__actions">
        {lot.sourceUrl ? <OutboundLink href={lot.sourceUrl} label={`View on ${formatLinkHost(lot.sourceUrl)}`} context={lotName(lot.lotNumber)} /> : null}
        {upcoming ? (
          <ButtonLink to={requestBidPath(lot.auction.id, lot.id)} aria-label={`Request a bid: ${lotName(lot.lotNumber)}, ${title}`}>Request a bid</ButtonLink>
        ) : <span className="lot-card__ended">Sale ended</span>}
      </div>
    </article>
  )
}
