import { requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { AuctionCard } from '../auctions/AuctionCard'
import type { AuctionWithCatalogues } from '../auctions/types'
import { CatalogueLink } from '../catalogues/CatalogueLink'

type FeaturedAuctionCardProps = {
  auction: AuctionWithCatalogues
}

export function FeaturedAuctionCard({ auction }: FeaturedAuctionCardProps): React.JSX.Element {
  return (
    <AuctionCard
      auction={auction}
      actions={
        <>
          <CatalogueLink auction={auction} label="Catalogue (PDF)" />
          <ButtonLink
            className="auction-card__action"
            to={requestBidPath(auction.id)}
            aria-label={`Request a bid: ${auction.title}`}
          >
            Request a bid
          </ButtonLink>
        </>
      }
    />
  )
}
