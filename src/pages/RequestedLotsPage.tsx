import { PageContainer } from '../components/layout/PageContainer'
import { EmptyState } from '../components/ui/EmptyState'

export function RequestedLotsPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Requested lots"
      title="Requested lots"
      description="Lots that already have an accepted bid request, so no two customers compete for the same lot. Customer identities and maximum bids are never shown."
    >
      <EmptyState title="Coming soon">The list of requested lots is on its way.</EmptyState>
    </PageContainer>
  )
}
