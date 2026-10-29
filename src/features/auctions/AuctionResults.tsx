import { use } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { countPages, type Page } from '../../services/pagination'
import { AuctionListingCard } from './AuctionListingCard'
import type { SaleStatus } from './saleStatus'
import type { Auction } from './types'

type AuctionResultsProps = {
  auctions: Promise<Page<Auction>>
  status: SaleStatus
  page: number
}

function pageSearch(status: SaleStatus, page: number): string {
  return page > 1 ? `?status=${status}&page=${page}` : `?status=${status}`
}

export function AuctionResults({ auctions: auctionsPromise, status, page }: AuctionResultsProps): React.JSX.Element {
  const { items: auctions, total, limit } = use(auctionsPromise)

  if (total === 0) {
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

  if (auctions.length === 0) {
    return <PastLastPage status={status} />
  }

  return (
    <>
      <h2 className="page__results-count">{`${total} ${status} ${total === 1 ? 'auction' : 'auctions'}`}</h2>
      <div className="auction-grid">
        {auctions.map((auction) => (
          <AuctionListingCard key={auction.id} auction={auction} />
        ))}
      </div>
      <Pagination
        label={`Pages of ${status} auctions`}
        page={page}
        pageCount={countPages({ total, limit })}
        pageLink={(target) => ({ search: pageSearch(status, target) })}
      />
    </>
  )
}

/** An old or mistyped ?page= beyond the last page */
function PastLastPage({ status }: { status: SaleStatus }): React.JSX.Element {
  return (
    <EmptyState
      title="No auctions on this page"
      actions={
        <ButtonLink to={{ search: pageSearch(status, 1) }} variant="secondary">
          Go to the first page
        </ButtonLink>
      }
    >
      {`There are fewer ${status} auctions than this page number suggests.`}
    </EmptyState>
  )
}
