import { Suspense, use } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLoaderData } from 'react-router'
import type { editAuctionLoader } from '../app/loaders'
import { adminAuctionPath, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { PageLoading } from '../components/layout/PageLoading'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { AuctionForm } from '../features/admin/AuctionForm'
import { auctionValuesFrom } from '../features/admin/auctionFormRules'
import type { AuctionWithCatalogues } from '../features/auctions/types'

export function EditAuctionPage(): React.JSX.Element {
  const { auctionId, auction } = useLoaderData<typeof editAuctionLoader>()

  return (
    <Suspense key={auctionId} fallback={<PageLoading />}>
      <EditAuction auction={auction} />
    </Suspense>
  )
}

function EditAuction({ auction: auctionPromise }: { auction: Promise<AuctionWithCatalogues | null> }): React.JSX.Element {
  const auction = use(auctionPromise)
  const backTo = auction ? adminAuctionPath(auction.id) : paths.adminAuctions

  return (
    <PageContainer
      breadcrumb={
        <ButtonLink variant="link" to={backTo}>
          <ArrowLeft size={16} />
          {auction ? auction.title : 'Auctions'}
        </ButtonLink>
      }
      eyebrow="Administration"
      title={auction ? 'Edit auction' : 'Auction not found'}
      description={auction ? 'Publishing, cancelling and deleting are on the sale’s own page.' : undefined}
    >
      {auction ? (
        <AuctionForm mode="edit" initialValues={auctionValuesFrom(auction)} cancelTo={backTo} />
      ) : (
        <EmptyState title="There is no sale at this address" actions={<ButtonLink to={paths.adminAuctions}>All auctions</ButtonLink>}>
          It may have been deleted, or the link may be mistyped.
        </EmptyState>
      )}
    </PageContainer>
  )
}
