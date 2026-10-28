import { Suspense, use } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLoaderData } from 'react-router'
import type { newCatalogueLoader } from '../app/loaders'
import { adminAuctionPath, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { CatalogueForm } from '../features/admin/CatalogueForm'
import { emptyCatalogueValues } from '../features/admin/catalogueFormRules'
import type { AuctionWithCatalogues } from '../features/auctions/types'

/** A new catalogue entry; opened from a sale, that sale is already chosen. */
export function NewCataloguePage(): React.JSX.Element {
  const { auctionId, auctions } = useLoaderData<typeof newCatalogueLoader>()
  const backTo = auctionId ? adminAuctionPath(auctionId) : paths.adminCatalogues

  return (
    <PageContainer
      breadcrumb={
        <ButtonLink variant="link" to={backTo}>
          <ArrowLeft size={16} />
          {auctionId ? 'Back to the sale' : 'Catalogues'}
        </ButtonLink>
      }
      eyebrow="Administration"
      title="Add a catalogue"
      description="Link the auction house's PDF and give the range of lots it covers. Customers choose it when requesting bids."
    >
      <Suspense fallback={<TableSkeleton rows={4} label="Loading sales" />}>
        <NewCatalogueForm auctions={auctions} auctionId={auctionId} cancelTo={backTo} />
      </Suspense>
    </PageContainer>
  )
}

type NewCatalogueFormProps = {
  auctions: Promise<AuctionWithCatalogues[]>
  auctionId: string
  cancelTo: string
}

function NewCatalogueForm({ auctions, auctionId, cancelTo }: NewCatalogueFormProps): React.JSX.Element {
  return <CatalogueForm mode="create" initialValues={emptyCatalogueValues(auctionId)} auctions={use(auctions)} cancelTo={cancelTo} />
}
