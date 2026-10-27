import { formatSaleDateFrench } from '../auctions/formatAuction'
import type { AuctionSummary, Catalogue } from '../auctions/types'
import './CatalogueCover.css'

type CatalogueCoverProps = {
  catalogue: Pick<Catalogue, 'title' | 'cover'>
  auction: Pick<AuctionSummary, 'house' | 'saleDate'>
}

/**
 * The scanned cover when the house supplies one. Otherwise a typeset cover drawn from the catalogue
 * details — DESIGN.md §7 rules out stock images and placeholder art.
 */
export function CatalogueCover({ catalogue, auction }: CatalogueCoverProps): React.JSX.Element {
  if (catalogue.cover) {
    return <img className="catalogue-cover" src={catalogue.cover.src} alt={catalogue.cover.alt} loading="lazy" />
  }

  return (
    <div className="catalogue-cover catalogue-cover--typeset" aria-hidden="true">
      <span className="catalogue-cover__house">{auction.house}</span>
      <span className="catalogue-cover__rule" />
      <span className="catalogue-cover__title">{catalogue.title}</span>
      <span className="catalogue-cover__date">{formatSaleDateFrench(auction.saleDate)}</span>
    </div>
  )
}
