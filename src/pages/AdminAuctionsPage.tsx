import { Suspense } from 'react'
import { useLoaderData, useLocation } from 'react-router'
import type { adminAuctionsLoader } from '../app/loaders'
import { newAuctionPath } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { Notice } from '../components/ui/Notice'
import { SegmentedLinks } from '../components/ui/SegmentedLinks'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { adminAuctionViews } from '../features/admin/adminAuctionService'
import { AdminAuctionsTable } from '../features/admin/AdminAuctionsTable'
import { readFlash } from '../features/admin/flash'

export function AdminAuctionsPage(): React.JSX.Element {
  const { view, page, auctions } = useLoaderData<typeof adminAuctionsLoader>()
  const flash = readFlash(useLocation().state)

  return (
    <PageContainer
      eyebrow="Administration"
      title="Auctions"
      description="Every sale, published or not. Drafts stay hidden from the website until you publish them."
    >
      {flash ? (
        <Notice tone="success" title="Done.">
          {flash}
        </Notice>
      ) : null}
      <div className="admin-actions">
        <ButtonLink to={newAuctionPath()}>New auction</ButtonLink>
      </div>
      <SegmentedLinks
        label="Show sales"
        options={adminAuctionViews.map((option) => ({
          label: option.label,
          to: { search: `?view=${option.value}` },
          isCurrent: option.value === view,
        }))}
      />
      <Suspense key={`${view}-${page}`} fallback={<TableSkeleton rows={6} label="Loading sales" />}>
        <AdminAuctionsTable auctions={auctions} view={view} page={page} />
      </Suspense>
    </PageContainer>
  )
}
