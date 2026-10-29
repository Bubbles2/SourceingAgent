import { Suspense, use, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useLoaderData } from 'react-router'
import type { lotsLoader } from '../app/loaders'
import { auctionPath, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { SaleStatusFilter } from '../features/auctions/SaleStatusFilter'
import type { SaleStatus } from '../features/auctions/saleStatus'
import type { Auction } from '../features/auctions/types'
import { LotGridSkeleton } from '../features/lots/LotCardSkeleton'
import { LotResults } from '../features/lots/LotResults'
import { LotViewToggle, type LotView } from '../features/lots/LotViewToggle'
import './LotsPage.css'

function statusSearch(status: SaleStatus, page: number): string {
  return page > 1 ? `?status=${status}&page=${page}` : `?status=${status}`
}

function saleSearch(auctionId: string, page: number): string {
  return page > 1 ? `?auction=${auctionId}&page=${page}` : `?auction=${auctionId}`
}

export function LotsPage(): React.JSX.Element {
  const { status, page, auctionId, auction, lots } = useLoaderData<typeof lotsLoader>()
  const [view, setView] = useState<LotView>('tiles')

  return (
    <PageContainer
      breadcrumb={
        auctionId ? (
          <ButtonLink variant="link" to={paths.lots}>
            <ArrowLeft size={16} />
            All lots
          </ButtonLink>
        ) : undefined
      }
      eyebrow="Lots"
      title="Auction lots"
      description="Every lot from the sales we follow, with the auction house's photos and descriptions. Find the ones you want, then ask the agent to bid on them."
    >
      <div className="lots-page__controls">
        {auctionId && auction ? (
          <Suspense fallback={<span className="skeleton skeleton--medium" />}>
            <SaleHeading auction={auction} />
          </Suspense>
        ) : (
          <SaleStatusFilter value={status} label="Show lots from" />
        )}
        <LotViewToggle view={view} onChange={setView} />
      </div>
      <Suspense
        key={`${auctionId ?? status}-${page}`}
        fallback={<LotGridSkeleton count={6} label={auctionId ? 'Loading lots' : `Loading lots in ${status} sales`} />}
      >
        {auctionId ? (
          <LotResults
            lots={lots}
            page={page}
            pageSearch={(target) => saleSearch(auctionId, target)}
            scope="in this sale"
            showAuction={false}
            view={view}
            empty={
              <EmptyState
                title="No lots for this sale"
                actions={<ButtonLink to={paths.lots}>Browse all lots</ButtonLink>}
              >
                The auction house hasn't published this sale's lots yet, or the sale no longer exists.
              </EmptyState>
            }
          />
        ) : (
          <LotResults
            lots={lots}
            page={page}
            pageSearch={(target) => statusSearch(status, target)}
            scope={`in ${status} sales`}
            view={view}
            empty={<NoLots status={status} />}
          />
        )}
      </Suspense>
    </PageContainer>
  )
}

/** Names the sale whose lots are listed */
function SaleHeading({ auction: auctionPromise }: { auction: Promise<Auction | null> }): React.JSX.Element | null {
  const auction = use(auctionPromise)
  if (!auction) {
    return null
  }
  return (
    <p className="lots-page__sale">
      {'Lots from '}
      <Link to={auctionPath(auction.id)}>{auction.title}</Link>
    </p>
  )
}

function NoLots({ status }: { status: SaleStatus }): React.JSX.Element {
  const otherStatus: SaleStatus = status === 'upcoming' ? 'completed' : 'upcoming'
  return (
    <EmptyState
      title={`No lots in ${status} sales`}
      actions={
        <ButtonLink to={{ search: `?status=${otherStatus}` }} variant="secondary" preventScrollReset>
          {`Show lots in ${otherStatus} sales`}
        </ButtonLink>
      }
    >
      {status === 'upcoming'
        ? 'Lots appear here as auction houses publish the catalogues of their next sales. Check back soon.'
        : 'Lots from past sales will appear here once those sales have taken place.'}
    </EmptyState>
  )
}
