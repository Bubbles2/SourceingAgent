import { Suspense, use } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useLoaderData } from 'react-router'
import type { editCatalogueLoader } from '../app/loaders'
import { adminAuctionPath, paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { PageLoading } from '../components/layout/PageLoading'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { CatalogueForm } from '../features/admin/CatalogueForm'
import { catalogueValuesFrom } from '../features/admin/catalogueFormRules'
import type { AuctionWithCatalogues, CatalogueWithAuction } from '../features/auctions/types'

export function EditCataloguePage(): React.JSX.Element {
  const { catalogueId, catalogue, auctions } = useLoaderData<typeof editCatalogueLoader>()

  return (
    <Suspense key={catalogueId} fallback={<PageLoading />}>
      <EditCatalogue catalogue={catalogue} auctions={auctions} />
    </Suspense>
  )
}

type EditCatalogueProps = {
  catalogue: Promise<CatalogueWithAuction | null>
  auctions: Promise<AuctionWithCatalogues[]>
}

function EditCatalogue({ catalogue: cataloguePromise, auctions: auctionsPromise }: EditCatalogueProps): React.JSX.Element {
  const catalogue = use(cataloguePromise)
  const auctions = use(auctionsPromise)
  const backTo = catalogue ? adminAuctionPath(catalogue.auctionId) : paths.adminCatalogues

  return (
    <PageContainer
      breadcrumb={
        <ButtonLink variant="link" to={backTo}>
          <ArrowLeft size={16} />
          {catalogue ? catalogue.auction.title : 'Catalogues'}
        </ButtonLink>
      }
      eyebrow="Administration"
      title={catalogue ? 'Edit catalogue' : 'Catalogue not found'}
    >
      {catalogue ? (
        <CatalogueForm mode="edit" initialValues={catalogueValuesFrom(catalogue)} auctions={auctions} cancelTo={backTo} />
      ) : (
        <EmptyState title="There is no catalogue at this address" actions={<ButtonLink to={paths.adminCatalogues}>All catalogues</ButtonLink>}>
          It may have been deleted, or the link may be mistyped.
        </EmptyState>
      )}
    </PageContainer>
  )
}
