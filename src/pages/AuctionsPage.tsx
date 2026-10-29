import { Suspense, useState } from 'react'
import { useLoaderData } from 'react-router'
import type { auctionsLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { AuctionGridSkeleton } from '../features/auctions/AuctionCardSkeleton'
import { AuctionResults } from '../features/auctions/AuctionResults'
import { SaleStatusFilter } from '../features/auctions/SaleStatusFilter'
import './AuctionsPage.css'

type AuctionView = 'tiles' | 'details'

export function AuctionsPage(): React.JSX.Element {
  const { status, page, auctions } = useLoaderData<typeof auctionsLoader>()
  const [view, setView] = useState<AuctionView>('tiles')

  return (
    <PageContainer
      eyebrow="Auctions"
      title="Auctions"
      description="Browse upcoming sales in Paris and the regions, or look back at completed ones. Open any auction for its details and lots."
    >
      <div className="auctions-page__controls">
        <SaleStatusFilter value={status} label="Show auctions" />
        <div className="auctions-page__view" role="group" aria-label="Auction view">
          <button type="button" aria-pressed={view === 'tiles'} onClick={() => setView('tiles')}>Tiles</button>
          <button type="button" aria-pressed={view === 'details'} onClick={() => setView('details')}>Details</button>
        </div>
      </div>
      <Suspense
        key={`${status}-${page}`}
        fallback={<AuctionGridSkeleton count={6} label={`Loading ${status} auctions`} />}
      >
        <AuctionResults auctions={auctions} status={status} page={page} view={view} />
      </Suspense>
    </PageContainer>
  )
}
