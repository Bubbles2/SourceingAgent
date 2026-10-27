import { use } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { AuctionListingCard } from './AuctionListingCard'
import type { SaleStatus } from './saleStatus'
import type { AuctionWithCatalogues } from './types'

type AuctionResultsProps = {
  auctions: Promise<readonly AuctionWithCatalogues[]>
  status: SaleStatus
}

export function AuctionResults({ auctions: auctionsPromise, status }: AuctionResultsProps): React.JSX.Element {
  const auctions = use(auctionsPromise)

  if (auctions.length === 0) {
    const otherStatus: SaleStatus = status === 'upcoming' ? 'completed' : 'upcoming'
    return (
      <EmptyState
        title={`No ${status} auctions`}
        actions={
          <ButtonLink to={{ search: `?status=${otherStatus}` }} variant="secondary" preventScrollReset>
            {`Show ${otherStatus} auctions`}
          </ButtonLink>
        }
      >
        {status === 'upcoming'
          ? 'New sales are added as auction houses publish their calendars. Check back soon.'
          : 'Past sales will appear here once they have taken place.'}
      </EmptyState>
    )
  }

  return (
    <>
      <h2 className="page__results-count">
        {`${auctions.length} ${status} ${auctions.length === 1 ? 'auction' : 'auctions'}`}
      </h2>
      <div className="auction-grid">
        {auctions.map((auction) => (
          <AuctionListingCard key={auction.id} auction={auction} />
        ))}
      </div>
    </>
  )
}
