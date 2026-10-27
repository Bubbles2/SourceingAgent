import { PageContainer } from '../components/layout/PageContainer'
import { PrototypeNotice } from '../components/ui/PrototypeNotice'
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
        <PrototypeNotice>
          Password reset is simulated: no email is sent. The prototype never saves passwords, so you can sign in with
          any password instead.
        </PrototypeNotice>
        <ForgotPasswordForm />
      </AuthLayout>
    </PageContainer>
  )
}
