import { Suspense, use, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { auctionLotsId, paths, requestBidPath } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { OutboundLink } from '../../components/ui/OutboundLink'
import type { Page } from '../../services/pagination'
import { LotGridSkeleton } from '../lots/LotCardSkeleton'
import { LotResults } from '../lots/LotResults'
import { LotViewToggle, type LotView } from '../lots/LotViewToggle'
import type { LotWithAuction } from '../lots/types'
import { formatLinkHost, formatLotCount, formatSaleDateLong, formatSaleTime } from './formatAuction'
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
  const [view, setView] = useState<LotView>('tiles')

  if (!auction) {
    return <AuctionNotFound />
  }

  const status = getSaleStatus(auction.auctionDate)

  return (
    <PageContainer
      breadcrumb={<BackToAuctions status={status} />}
      eyebrow="Auction"
      title={auction.title}
      description={[
        auction.auctionDate ? formatSaleDateLong(auction.auctionDate) : 'Date to be announced',
        auction.startsAt ? `${formatSaleTime(auction.startsAt)}, Paris time` : null,
        auction.location,
        auction.lotCount > 0 ? formatLotCount(auction.lotCount) : 'Lots not yet published',
      ].filter(Boolean).join(' · ')}
    >
      <div className="auction-details">
        <div className="auction-details__actions">
          {auction.catalogueUrl ? <OutboundLink href={auction.catalogueUrl} label={`Catalogue on ${formatLinkHost(auction.catalogueUrl)}`} context={auction.title} /> : null}
          {status === 'upcoming' ? <ButtonLink to={requestBidPath(auction.id)}>Request a bid</ButtonLink> : null}
        </div>
        <section id={auctionLotsId} className="auction-details__section" aria-labelledby="auction-lots-title">
          <div className="auction-details__section-head">
            <h2 id="auction-lots-title" className="auction-details__heading">
              Lots
            </h2>
            <LotViewToggle view={view} onChange={setView} />
          </div>
            <Suspense key={page} fallback={<LotGridSkeleton count={4} label="Loading the lots" />}>
              <LotResults
                lots={lots}
                page={page}
                pageSearch={lotsSearch}
                scope="in this sale"
                showAuction={false}
                view={view}
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
