import { useEffect } from 'react'
import { isRouteErrorResponse, useLocation, useRouteError } from 'react-router'
import { paths, signInPath } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { AdministratorsOnly } from '../features/admin/AdministratorsOnly'
import { refreshSession } from '../features/auth/sessionStore'
import { isAccessError } from '../services/apiClient'

function handleRetry(): void {
  window.location.reload()
}

/** Route error boundary: a safe message inside the normal layout, never the raw error. */
export function RouteErrorPage(): React.JSX.Element {
  const error = useRouteError()
  const location = useLocation()
  const accessError = isAccessError(error)
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  // The API turned the page's data away: the session ended, or the account lost the role.
  useEffect(() => {
    if (accessError) {
      // The header still shows the account the page was loaded for; ask the API who is signed in now.
      void refreshSession()
    }
  }, [accessError])

  if ((isRouteErrorResponse(error) && error.status === 403) || (accessError && error.code === 'forbidden')) {
    return <AdministratorsOnly />
  }

  if (accessError) {
    return (
      <PageContainer eyebrow="Your account" title="Sign in again">
        <EmptyState
          title="Your session has ended"
          actions={<ButtonLink to={signInPath(`${location.pathname}${location.search}`)}>Sign in</ButtonLink>}
        >
          You were signed out, so this page couldn't load. Sign in again to carry on where you left off.
        </EmptyState>
      </PageContainer>
    )
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
