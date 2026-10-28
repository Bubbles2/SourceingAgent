import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { cataloguesLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { SaleStatusFilter } from '../features/auctions/SaleStatusFilter'
import { CatalogueGridSkeleton } from '../features/catalogues/CatalogueCardSkeleton'
import { CatalogueResults } from '../features/catalogues/CatalogueResults'

export function CataloguesPage(): React.JSX.Element {
  const { status, page, catalogues } = useLoaderData<typeof cataloguesLoader>()

  return (
    <PageContainer
      eyebrow="Catalogues"
      title="Auction catalogues"
      description="Each sale's official PDF catalogue, published by the auction house. Study every lot, then ask the agent to bid on the ones you want."
    >
      <SaleStatusFilter value={status} label="Show catalogues for" />
      <Suspense
        key={`${status}-${page}`}
        fallback={<CatalogueGridSkeleton count={4} label={`Loading catalogues for ${status} sales`} />}
      >
        <CatalogueResults catalogues={catalogues} status={status} page={page} />
      </Suspense>
    </PageContainer>
  )
}
