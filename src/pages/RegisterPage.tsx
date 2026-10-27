import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function RegisterPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Account"
      title="Create an account"
      description="A free account lets you submit bid requests, follow their status and keep every catalogue in one place."
    >
      <EmptyState
        title="Coming soon"
        actions={
          <ButtonLink to={paths.signIn} variant="secondary">
            Sign in
          </ButtonLink>
        }
      >
        Registration is on its way. Existing customers will sign in from the same place.
      </EmptyState>
    </PageContainer>
  )
}
