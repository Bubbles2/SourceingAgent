import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { adminCataloguesLoader } from '../app/loaders'
import { newCataloguePath } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { SegmentedLinks } from '../components/ui/SegmentedLinks'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { AdminCataloguesTable } from '../features/admin/AdminCataloguesTable'
import { saleStatusOptions } from '../features/auctions/saleStatus'

export function AdminCataloguesPage(): React.JSX.Element {
  const { period, page, catalogues } = useLoaderData<typeof adminCataloguesLoader>()

  return (
    <PageContainer
      eyebrow="Administration"
      title="Catalogues"
      description="The auction houses' PDF catalogues for every sale. Customers see those of published sales."
    >
      <div className="admin-actions">
        <ButtonLink to={newCataloguePath()}>Add catalogue</ButtonLink>
      </div>
      <SegmentedLinks
        label="Show catalogues for"
        options={saleStatusOptions.map((option) => ({
          label: `${option.label} sales`,
          to: { search: `?period=${option.value}` },
          isCurrent: option.value === period,
        }))}
      />
      <Suspense key={`${period}-${page}`} fallback={<TableSkeleton rows={6} label="Loading catalogues" />}>
        <AdminCataloguesTable catalogues={catalogues} period={period} page={page} />
      </Suspense>
    </PageContainer>
  )
}
