import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { myRequestsLoader } from '../app/loaders'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { useCurrentCustomer } from '../features/auth/useCurrentCustomer'
import { MyRequestsTable } from '../features/bid-requests/MyRequestsTable'
import { StatusLegend } from '../features/bid-requests/StatusLegend'
import './MyRequestsPage.css'

// myRequestsLoader sends visitors to sign in first; signing out elsewhere hides the list here too.
export function MyRequestsPage(): React.JSX.Element {
  const { requests } = useLoaderData<typeof myRequestsLoader>()
  const customer = useCurrentCustomer()

  return (
    <PageContainer
      eyebrow="Your account"
      title="My requests"
      description="Every bid request you have made, with its maximum bid and where it stands."
    >
      {customer ? (
        <>
          <div className="my-requests__toolbar">
            <ButtonLink to={paths.requestBid}>Request a bid</ButtonLink>
          </div>
          <Suspense fallback={<TableSkeleton rows={5} label="Loading your requests" />}>
            <MyRequestsTable requests={requests} />
          </Suspense>
          <StatusLegend />
        </>
      ) : (
        <EmptyState title="You're signed out" actions={<ButtonLink to={paths.signIn}>Sign in</ButtonLink>}>
          Sign in again to see your requests.
        </EmptyState>
      )}
    </PageContainer>
  )
}
