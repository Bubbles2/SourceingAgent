import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { reviewRequestsLoader } from '../app/loaders'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import { SegmentedLinks } from '../components/ui/SegmentedLinks'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { useCurrentCustomer } from '../features/auth/useCurrentCustomer'
import { reviewViewOptions } from '../features/request-review/reviewDecisions'
import { ReviewRequestsTable } from '../features/request-review/ReviewRequestsTable'

// reviewRequestsLoader sends visitors to sign in and only fetches for administrators. The API
// refuses everyone else too; this page just explains why.
export function ReviewRequestsPage(): React.JSX.Element {
  const { view, page, requests } = useLoaderData<typeof reviewRequestsLoader>()
  const account = useCurrentCustomer()

  return (
    <PageContainer
      eyebrow="Administration"
      title="Bid requests"
      description="Accept or reject new requests, then record the bids placed and their results. Every change is kept in the request's history."
    >
      {!account ? (
        <EmptyState title="You're signed out" actions={<ButtonLink to={paths.signIn}>Sign in</ButtonLink>}>
          Sign in again to review requests.
        </EmptyState>
      ) : account.role !== 'administrator' || !requests ? (
        <Notice tone="info" title="Administrators only.">
          This page is for the agent's team. You can follow your own requests under My requests.
        </Notice>
      ) : (
        <>
          <SegmentedLinks
            label="Show requests"
            options={reviewViewOptions.map((option) => ({
              label: option.label,
              to: { search: `?view=${option.value}` },
              isCurrent: option.value === view,
            }))}
          />
          <Suspense key={`${view}-${page}`} fallback={<TableSkeleton rows={6} label="Loading bid requests" />}>
            <ReviewRequestsTable requests={requests} view={view} page={page} />
          </Suspense>
        </>
      )}
    </PageContainer>
  )
}
