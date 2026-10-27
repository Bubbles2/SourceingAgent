import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { StatusLegend } from '../features/bid-requests/StatusLegend'

export function MyRequestsPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Your account"
      title="My requests"
      description="Follow each bid request from review to result, with its auction, lot number and maximum bid."
    >
      <EmptyState
        title="Coming soon"
        actions={
          <ButtonLink to={paths.signIn} variant="secondary">
            Sign in
          </ButtonLink>
        }
      >
        Your requests will appear here once you can sign in and submit them.
      </EmptyState>
      <StatusLegend />
    </PageContainer>
  )
}
