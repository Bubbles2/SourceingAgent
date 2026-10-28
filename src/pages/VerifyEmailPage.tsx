import { Suspense } from 'react'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingRegion } from '../components/ui/LoadingRegion'
import { AuthLayout } from '../features/auth/AuthLayout'
import { EmailVerificationResult } from '../features/auth/EmailVerificationResult'
import { useLinkToken } from '../features/auth/useLinkToken'

export function VerifyEmailPage(): React.JSX.Element {
  const token = useLinkToken()

  return (
    <PageContainer eyebrow="Account" title="Confirm your email address">
      <AuthLayout>
        {token ? (
          <Suspense fallback={<ConfirmingSkeleton />}>
            <EmailVerificationResult token={token} />
          </Suspense>
        ) : (
          <EmptyState title="This link is incomplete" actions={<ButtonLink to={paths.account}>Go to your account</ButtonLink>}>
            Open the link from your email again, making sure all of it was copied. You can ask for a new link from
            your account page.
          </EmptyState>
        )}
      </AuthLayout>
    </PageContainer>
  )
}

function ConfirmingSkeleton(): React.JSX.Element {
  return (
    <LoadingRegion label="Confirming your email address">
      <div className="auth-card">
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--medium" />
      </div>
    </LoadingRegion>
  )
}
