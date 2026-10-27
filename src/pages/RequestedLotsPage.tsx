import { PageContainer } from '../components/layout/PageContainer'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'

export function RequestedLotsPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Requested lots"
      title="Requested lots"
      description="Lots that already have an accepted bid request, so no two customers compete for the same lot. Customer identities and maximum bids are never shown."
    >
      <PlaceholderPanel>The list of requested lots is on its way.</PlaceholderPanel>
    </PageContainer>
  )
}
