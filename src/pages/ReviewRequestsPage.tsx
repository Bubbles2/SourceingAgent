import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { reviewRequestsLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { SegmentedLinks } from '../components/ui/SegmentedLinks'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { reviewSearch, reviewViewOptions } from '../features/request-review/reviewDecisions'
import { ReviewFilters } from '../features/request-review/ReviewFilters'
import { ReviewRequestsTable } from '../features/request-review/ReviewRequestsTable'

// Only administrators reach this page (reviewRequestsLoader and AdminLayout), and the API checks again.
export function ReviewRequestsPage(): React.JSX.Element {
  const { view, page, auction, customer, requests, auctions } = useLoaderData<typeof reviewRequestsLoader>()
  const filters = { auction, customer }

  return (
    <PageContainer
      eyebrow="Administration"
      title="Bid requests"
      description="Accept or reject new requests, then record the bids placed and their results. Every change is kept in the request's history."
    >
      <SegmentedLinks
        label="Show requests"
        options={reviewViewOptions.map((option) => ({
          label: option.label,
          to: { search: reviewSearch(option.value, filters) },
          isCurrent: option.value === view,
        }))}
      />
      <Suspense fallback={<TableSkeleton rows={1} label="Loading filters" />}>
        <ReviewFilters view={view} auction={auction} customer={customer} auctions={auctions} />
      </Suspense>
      <Suspense key={`${view}-${page}-${auction}-${customer}`} fallback={<TableSkeleton rows={6} label="Loading bid requests" />}>
        <ReviewRequestsTable requests={requests} view={view} page={page} filters={filters} />
      </Suspense>
    </PageContainer>
  )
}
