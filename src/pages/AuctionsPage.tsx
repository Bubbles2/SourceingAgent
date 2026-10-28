import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { auctionsLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { AuctionGridSkeleton } from '../features/auctions/AuctionCardSkeleton'
import { AuctionResults } from '../features/auctions/AuctionResults'
import { SaleStatusFilter } from '../features/auctions/SaleStatusFilter'

export function AuctionsPage(): React.JSX.Element {
  const { status, page, auctions } = useLoaderData<typeof auctionsLoader>()

  return (
    <PageContainer
      eyebrow="Auctions"
      title="Auctions"
      description="Browse upcoming sales in Paris and the regions, or look back at completed ones. Open any auction for its details and catalogue."
    >
      <SaleStatusFilter value={status} label="Show auctions" />
      <Suspense
        key={`${status}-${page}`}
        fallback={<AuctionGridSkeleton count={6} label={`Loading ${status} auctions`} showDescription />}
      >
        <AuctionResults auctions={auctions} status={status} page={page} />
      </Suspense>
    </PageContainer>
  )
}
