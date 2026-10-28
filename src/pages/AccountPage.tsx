import { useLocation } from 'react-router'
import { paths } from '../app/paths'
import { PageContainer } from '../components/layout/PageContainer'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import { AccountDetails } from '../features/auth/AccountDetails'
import { EmailVerificationNotice } from '../features/auth/EmailVerificationNotice'
import { useCurrentCustomer } from '../features/auth/useCurrentCustomer'
import { isWelcomeState } from '../features/auth/welcomeState'

// accountLoader sends visitors to sign in first; this page then follows the live session.
export function AccountPage(): React.JSX.Element {
  const customer = useCurrentCustomer()
  const location = useLocation()

  if (!customer) {
    return (
      <PageContainer eyebrow="Account" title="Your account">
        <EmptyState title="You're signed out" actions={<ButtonLink to={paths.signIn}>Sign in</ButtonLink>}>
          Sign in again to see your account.
        </EmptyState>
      </PageContainer>
    )
  }

  return (
    <PageContainer eyebrow="Account" title="Your account" description="Your profile and contact details.">
      {isWelcomeState(location.state) ? (
        <Notice tone="success" title="Account created.">
          You are signed in and can browse sales while you confirm your email address.
        </Notice>
      ) : null}
      {customer.emailVerified ? null : <EmailVerificationNotice email={customer.email} />}
      <AccountDetails account={customer} />
    </PageContainer>
  )
}
