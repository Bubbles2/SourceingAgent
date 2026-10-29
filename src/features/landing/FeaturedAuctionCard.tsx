import { auctionLotsPath, requestBidPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { AuctionCard } from '../auctions/AuctionCard'
import type { Auction } from '../auctions/types'

type FeaturedAuctionCardProps = {
  auction: Auction
}

export function FeaturedAuctionCard({ auction }: FeaturedAuctionCardProps): React.JSX.Element {
  return (
    <AuctionCard
      auction={auction}
      actions={
        <>
          <ButtonLink variant="link" to={auctionLotsPath(auction.id)} aria-label={`Browse the lots: ${auction.title}`}>
            Browse the lots
          </ButtonLink>
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
