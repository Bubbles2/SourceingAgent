import { CalendarDays, Gavel } from 'lucide-react'
import { Link } from 'react-router'
import { auctionPath, requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { formatCatalogueMeta, formatSaleDateShort } from '../auctions/formatAuction'
import { getSaleStatus } from '../auctions/saleStatus'
import type { AuctionSummary, Catalogue } from '../auctions/types'
import { CatalogueCover } from './CatalogueCover'
import { PdfLink } from './PdfLink'
import './CatalogueCard.css'

type CatalogueCardProps = {
  catalogue: Catalogue
  auction: AuctionSummary
  /** Hide the auction link and date, e.g. on the auction's own page */
  showAuction?: boolean
}

export function CatalogueCard({ catalogue, auction, showAuction = true }: CatalogueCardProps): React.JSX.Element {
  const titleId = `catalogue-${catalogue.id}-title`
  const isUpcoming = getSaleStatus(auction.saleDate) === 'upcoming'

  return (
    <article className="catalogue-card" aria-labelledby={titleId}>
      <div className="catalogue-card__cover">
        <CatalogueCover catalogue={catalogue} auction={auction} />
      </div>

      <div className="catalogue-card__body">
        <p className="catalogue-card__meta">{formatCatalogueMeta(catalogue)}</p>
        <h3 id={titleId} className="catalogue-card__title">
          {catalogue.title}
        </h3>
        {showAuction ? (
          <ul className="catalogue-card__facts">
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
                <time dateTime={auction.saleDate}>{formatSaleDateShort(auction.saleDate)}</time>
                {` · ${auction.saleTime} · ${auction.house}, ${auction.city}`}
              </span>
            </li>
          </ul>
        ) : null}
        <p className="catalogue-card__description">{catalogue.description}</p>
      </div>

      <div className="catalogue-card__foot">
        <PdfLink href={catalogue.pdfUrl} label="Open PDF" context={catalogue.title} />
        {isUpcoming ? (
          <ButtonLink
            className="catalogue-card__action"
            to={requestBidPath(auction.id, catalogue.id)}
            aria-label={`Request a bid: ${catalogue.title}`}
          >
            Request a bid
          </ButtonLink>
        ) : (
          <span className="catalogue-card__ended">Sale ended</span>
        )}
      </div>
    </article>
  )
}
