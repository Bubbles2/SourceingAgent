import { auctionPath } from '../../app/paths'
import { ButtonLink } from '../../components/ui/Button'
import { OutboundLink } from '../../components/ui/OutboundLink'
import { AuctionCard } from './AuctionCard'
import { formatLinkHost } from './formatAuction'
import type { Auction } from './types'

type AuctionListingCardProps = {
  auction: Auction
}

export function AuctionListingCard({ auction }: AuctionListingCardProps): React.JSX.Element {
  return (
    <AuctionCard
      auction={auction}
      actions={
        <>
          {auction.catalogueUrl ? (
            <OutboundLink
              href={auction.catalogueUrl}
              label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`}
              context={auction.title}
            />
          ) : (
            <span />
          )}
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
