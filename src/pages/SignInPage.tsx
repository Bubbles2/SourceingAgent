import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function SignInPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Account"
      title="Sign in"
      description="Sign in to submit bid requests and follow their status under My requests."
    >
      <EmptyState
        title="Coming soon"
        actions={
          <ButtonLink to={paths.register} variant="secondary">
            Create account
          </ButtonLink>
        }
      >
        Signing in is on its way. New customers will be able to create a free account.
      </EmptyState>
    </PageContainer>
  )
}
