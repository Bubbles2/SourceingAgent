import { paths } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'

/** Shown to signed-in customers who open an administration page. */
export function AdministratorsOnly(): React.JSX.Element {
  return (
    <PageContainer eyebrow="Administration" title="Administrators only">
      <EmptyState
        title="This page is for the agent's team"
        actions={
          <ButtonLink to={paths.myRequests} variant="secondary">
            Go to My requests
          </ButtonLink>
        }
      >
        You can follow your own bid requests under My requests.
      </EmptyState>
    </PageContainer>
  )
}
