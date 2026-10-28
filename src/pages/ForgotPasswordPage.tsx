import { PageContainer } from '../components/layout/PageContainer'
import { AuthLayout } from '../features/auth/AuthLayout'
import { ForgotPasswordForm } from '../features/auth/ForgotPasswordForm'

export function ForgotPasswordPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Account"
      title="Reset your password"
      description="Enter the email address you registered with and we will send you a link to choose a new password."
    >
      <AuthLayout>
        <ForgotPasswordForm />
      </AuthLayout>
    </PageContainer>
  )
}
