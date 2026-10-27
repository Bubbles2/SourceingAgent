import { auctionPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { CatalogueLink } from '../catalogues/CatalogueLink'
import { AuctionCard } from './AuctionCard'
import type { AuctionWithCatalogues } from './types'

type AuctionListingCardProps = {
  auction: AuctionWithCatalogues
}

export function AuctionListingCard({ auction }: AuctionListingCardProps): React.JSX.Element {
  return (
    <AuctionCard
      auction={auction}
      showDescription
      actions={
        <>
          <CatalogueLink auction={auction} label="View catalogue" />
          <ButtonLink
            className="auction-card__action"
            to={auctionPath(auction.id)}
            aria-label={`View details: ${auction.title}`}
          >
            View details
          </ButtonLink>
        </>
      }
    />
  )
}
