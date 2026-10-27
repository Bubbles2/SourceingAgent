import { Suspense } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import type { myRequestsLoader } from '../app/loaders'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, ButtonLink } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { resetDemoBidRequests } from '../features/bid-requests/bidRequestService'
import { MyRequestsTable } from '../features/bid-requests/MyRequestsTable'
import { PrototypeNotice } from '../components/ui/PrototypeNotice'
import { StatusLegend } from '../features/bid-requests/StatusLegend'
import './MyRequestsPage.css'

export function MyRequestsPage(): React.JSX.Element {
  const { requests } = useLoaderData<typeof myRequestsLoader>()
  const revalidator = useRevalidator()

  function handleClearSubmitted(): void {
    resetDemoBidRequests()
    void revalidator.revalidate()
  }

  return (
    <PageContainer
      eyebrow="Your account"
      title="My requests"
      description="Every bid request you have made, with its maximum bid and where it stands."
    >
      <PrototypeNotice>
        You are viewing the demo customer's sample requests: bid requests aren't linked to the account you sign in
        with yet. Requests you submit are saved in this browser only.
      </PrototypeNotice>
      <div className="my-requests__toolbar">
        <ButtonLink to={paths.requestBid}>Request a bid</ButtonLink>
        <Button variant="secondary" onClick={handleClearSubmitted}>
          Clear requests made in this browser
        </Button>
      </div>
      <Suspense fallback={<TableSkeleton rows={7} label="Loading your requests" />}>
        <MyRequestsTable requests={requests} />
      </Suspense>
      <StatusLegend />
    </PageContainer>
  )
}
