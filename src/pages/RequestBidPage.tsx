import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { FeesNotice } from '../features/bid-requests/FeesNotice'

export function RequestBidPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Bid requests"
      title="Request a bid"
      description="Choose the auction and catalogue, enter the lot number and your maximum bid in EUR, and add any instructions for the agent."
    >
      <EmptyState
        title="Coming soon"
        actions={
          <>
            <ButtonLink to={paths.register}>Create account</ButtonLink>
            <ButtonLink to={paths.signIn} variant="secondary">
              Sign in
            </ButtonLink>
          </>
        }
      >
        The bid request form is on its way. Only registered customers can submit requests, and the agent reviews
        each one before accepting it.
      </EmptyState>
      <FeesNotice />
    </PageContainer>
  )
}
