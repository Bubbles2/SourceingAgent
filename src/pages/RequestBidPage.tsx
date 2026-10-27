import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { PlaceholderPanel } from '../components/ui/PlaceholderPanel'
import { FeesNotice } from '../features/bid-requests/FeesNotice'

export function RequestBidPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Bid requests"
      title="Request a bid"
      description="Choose the auction and catalogue, enter the lot number and your maximum bid in EUR, and add any instructions for the agent."
    >
      <PlaceholderPanel
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
      </PlaceholderPanel>
      <FeesNotice />
    </PageContainer>
  )
}
