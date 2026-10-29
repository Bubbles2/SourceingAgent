import { Suspense, use } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import { auctionLotsId, paths } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { Page } from '../../services/pagination'
import { PricingNotice } from '../bid-requests/PricingNotice'
import { LotGridSkeleton } from '../lots/LotCardSkeleton'
import { LotResults } from '../lots/LotResults'
import type { LotWithAuction } from '../lots/types'
import { AuctionFacts } from './AuctionFacts'
import { getSaleStatus, type SaleStatus } from './saleStatus'
import type { Auction } from './types'
import './AuctionDetails.css'

type AuctionDetailsProps = {
  auction: Promise<Auction | null>
  lots: Promise<Page<LotWithAuction>>
  /** Page of the sale's lots */
  page: number
}

function lotsSearch(page: number): string {
  return page > 1 ? `?page=${page}` : '?'
}

export function AuctionDetails({ auction: auctionPromise, lots, page }: AuctionDetailsProps): React.JSX.Element {
  const auction = use(auctionPromise)

  if (!auction) {
    return <AuctionNotFound />
  }

  const status = getSaleStatus(auction.auctionDate)

  return (
    <PageContainer
      breadcrumb={<BackToAuctions status={status} />}
      eyebrow="Auction"
      title={auction.title}
      description={
        auction.location ? (
          <span className="auction-details__house">
            <MapPin size={18} />
            {auction.location}
          </span>
        ) : undefined
      }
    >
      <div className="auction-details">
        <div className="auction-details__aside">
          <AuctionFacts auction={auction} status={status} />
          {status === 'upcoming' ? <PricingNotice /> : null}
        </div>

        <div className="auction-details__main">
          <section id={auctionLotsId} className="auction-details__section" aria-labelledby="auction-lots-title">
            <h2 id="auction-lots-title" className="auction-details__heading">
              Lots
            </h2>
            <Suspense key={page} fallback={<LotGridSkeleton count={4} label="Loading the lots" />}>
              <LotResults
                lots={lots}
                page={page}
                pageSearch={lotsSearch}
                scope="in this sale"
                showAuction={false}
                empty={
                  <EmptyState title="Lots not yet published">
                    The auction house hasn't published the lots for this sale yet. They will appear here as soon as
                    they are available.
                  </EmptyState>
                }
              />
            </Suspense>
          </section>
        </div>
      </div>
    </PageContainer>
  )
}

function BackToAuctions({ status }: { status: SaleStatus }): React.JSX.Element {
  return (
    <ButtonLink variant="link" to={{ pathname: paths.auctions, search: `?status=${status}` }}>
      <ArrowLeft size={16} />
      {status === 'upcoming' ? 'Upcoming auctions' : 'Completed auctions'}
    </ButtonLink>
  )
}

function AuctionNotFound(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Auctions" title="Auction not found">
      <EmptyState
        title="We couldn't find this auction"
        actions={<ButtonLink to={paths.auctions}>View all auctions</ButtonLink>}
      >
        The link may be out of date, or the sale may have been withdrawn by the auction house.
      </EmptyState>
    </PageContainer>
  )
}
