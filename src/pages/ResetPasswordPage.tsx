import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { AuthLayout } from '../features/auth/AuthLayout'
import { ResetPasswordForm } from '../features/auth/ResetPasswordForm'
import { useLinkToken } from '../features/auth/useLinkToken'

export function ResetPasswordPage(): React.JSX.Element {
  const token = useLinkToken()

  return (
    <PageContainer
      eyebrow="Account"
      title="Choose a new password"
      description="Changing your password signs you out on every device."
    >
      <AuthLayout>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <EmptyState
            title="This link is incomplete"
            actions={<ButtonLink to={paths.forgotPassword}>Request a new link</ButtonLink>}
          >
            Open the link from your email again, making sure all of it was copied, or request a new one.
          </EmptyState>
        )}
      </AuthLayout>
    </PageContainer>
  )
}
