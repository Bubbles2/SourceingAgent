import { Gavel, ListChecks, Lock } from 'lucide-react'
import { PageContainer } from '../components/layout/PageContainer'
import { PrototypeNotice } from '../components/ui/PrototypeNotice'
import { AuthAside, AuthLayout } from '../features/auth/AuthLayout'
import { RegistrationForm } from '../features/auth/RegistrationForm'

export function RegisterPage(): React.JSX.Element {
  return (
    <PageContainer
      eyebrow="Account"
      title="Create an account"
      description="A free account lets you ask the agent to bid on lots for you and follow each request from review to result."
    >
      <AuthLayout aside={<RegisterAside />}>
        <PrototypeNotice>
          Registration is simulated in this browser, so please use made-up details: they are saved in this browser
          only. Your password is never saved or sent anywhere, which also means the prototype cannot protect an
          account.
        </PrototypeNotice>
        <RegistrationForm />
      </AuthLayout>
    </PageContainer>
  )
}

function RegisterAside(): React.JSX.Element {
  return (
    <AuthAside title="What your account is for">
      <ul className="auth-aside__list">
        <li>
          <span className="auth-aside__icon">
            <Gavel size={18} />
          </span>
          <p>Ask the agent to bid on lots at Parisien auctions, up to the maximum you set.</p>
        </li>
        <li>
          <span className="auth-aside__icon">
            <ListChecks size={18} />
          </span>
          <p>Follow each request from review to result under My requests.</p>
        </li>
        <li>
          <span className="auth-aside__icon">
            <Lock size={18} />
          </span>
          <p>Your name and maximum bids are never shown publicly.</p>
        </li>
      </ul>
    </AuthAside>
  )
}
