import { isRouteErrorResponse, useRouteError } from 'react-router'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { AdministratorsOnly } from '../features/admin/AdministratorsOnly'

function handleRetry(): void {
  window.location.reload()
}

/** Route error boundary: a safe message inside the normal layout, never the raw error. */
export function RouteErrorPage(): React.JSX.Element {
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  if (isRouteErrorResponse(error) && error.status === 403) {
    return <AdministratorsOnly />
  }

  return (
    <PageContainer eyebrow={isNotFound ? 'Error 404' : 'Error'} title={isNotFound ? 'Page not found' : 'Something went wrong'}>
      <EmptyState
        title={isNotFound ? "This page doesn't exist" : "We couldn't load this page"}
        actions={
          <>
            {isNotFound ? null : <Button onClick={handleRetry}>Try again</Button>}
            <ButtonLink to={paths.home} variant={isNotFound ? 'primary' : 'secondary'}>
              Back to the home page
            </ButtonLink>
          </>
        }
      >
        {isNotFound
          ? 'The address may be mistyped, or the page may have moved.'
          : 'Please try again in a moment. If the problem continues, return to the home page.'}
      </EmptyState>
    </PageContainer>
  )
}
