import { Suspense } from 'react'
import { useLoaderData } from 'react-router'
import type { requestedLotsLoader } from '../app/loaders'
import { PageContainer } from '../components/layout/PageContainer'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { PrototypeNotice } from '../features/bid-requests/PrototypeNotice'
import { RequestedLotsTable } from '../features/bid-requests/RequestedLotsTable'

export function RequestedLotsPage(): React.JSX.Element {
  const { lots } = useLoaderData<typeof requestedLotsLoader>()

  return (
    <PageContainer
      eyebrow="Requested lots"
      title="Requested lots"
      description="Lots that already have an accepted bid request. A reserved lot can't take another request, so no two customers compete for it. Customer identities and maximum bids are never shown."
    >
      <PrototypeNotice>
        This list is built from sample data in your browser. In the live service it will come from the server, which
        removes customer details and bid amounts before anything is sent.
      </PrototypeNotice>
      <Suspense fallback={<TableSkeleton rows={6} label="Loading requested lots" />}>
        <RequestedLotsTable lots={lots} />
      </Suspense>
    </PageContainer>
  )
}
